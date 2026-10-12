import { NextResponse, type NextRequest } from "next/server";
import { prRejectSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getPR, rejectPR } from "@/server/repos/purchaseRequests";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  validateUuidParam,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPRRejected } from "@/server/services/notifications";
import { requireCan } from "@/server/session";
import { canRejectAtStep, isExpectedStepStale, isSelfApprovalBlocked } from "@/lib/procurement-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-requests/[id]/reject — admin/planner/purchaser có quyền
 * approve PR; chỉ áp dụng khi phiếu đang chờ một trong hai cấp duyệt.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;

  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);
  if (
    before.approvalStep !== "SUBMITTED" &&
    before.approvalStep !== "DEPT_APPROVED"
  ) {
    return jsonError(
      "INVALID_STATE",
      "Chỉ phiếu đang chờ phê duyệt mới có thể bị từ chối.",
      409,
    );
  }

  // M1 — client gửi bước nó đang thấy; phiếu đã sang bước khác → 409 (không từ chối nhầm bước).
  // Đọc body sớm chỉ để lấy expectedStep (parseJson ở dưới kiểm hợp lệ đầy đủ).
  const peek = (await req.clone().json().catch(() => null)) as { expectedStep?: unknown } | null;
  if (
    typeof peek?.expectedStep === "string" &&
    isExpectedStepStale(before.approvalStep, peek.expectedStep)
  ) {
    return jsonError("STEP_CHANGED", "Phiếu đã đổi bước, tải lại trang.", 409);
  }

  // A8 — khoá đúng bước: SUBMITTED → Kho/admin; DEPT_APPROVED → Mua hàng/admin.
  if (!canRejectAtStep(before.approvalStep, guard.session.roles)) {
    return jsonError(
      "FORBIDDEN",
      before.approvalStep === "SUBMITTED"
        ? "Phiếu đang chờ Kho duyệt — chỉ Kho hoặc Admin được từ chối ở bước này."
        : "Phiếu đang chờ duyệt cuối — chỉ Mua hàng hoặc Admin được từ chối ở bước này.",
      403,
    );
  }

  // V4.1 D8 (P1-2 audit) — người lập phiếu không tự từ chối phiếu của mình,
  // đồng bộ với dept-approve/director-approve (trừ admin).
  if (
    isSelfApprovalBlocked({
      creatorId: before.requestedBy,
      actorId: guard.session.userId,
      actorRoles: guard.session.roles,
    })
  ) {
    return jsonError(
      "SELF_APPROVAL",
      "Bạn là người lập phiếu này — cần người khác từ chối.",
      403,
    );
  }

  const body = await parseJson(req, prRejectSchema);
  if ("response" in body) return body.response;

  try {
    const row = await rejectPR(
      params.id,
      guard.session.userId,
      body.data.reason,
      before.approvalStep as "SUBMITTED" | "DEPT_APPROVED",
    );
    if (!row) return jsonError("CONFLICT", "Phiếu đã đổi bước duyệt trong lúc bạn thao tác — tải lại trang rồi thử lại.", 409);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CANCEL",
      objectType: "purchase_request",
      objectId: params.id,
      before: { status: before.status },
      after: { status: row.status, closedAtIssued: row.closedAtIssued, extraOnly: row.extraOnly },
      notes: row.extraOnly
        ? `Từ chối phần mua thêm (giữ phần đã duyệt trước): ${body.data.reason}`
        : row.closedAtIssued
        ? `Từ chối phần cần mua (đã xuất phần có sẵn — phiếu hoàn tất): ${body.data.reason}`
        : body.data.reason,
      ...meta,
    });

    void notifyPRRejected({
      prId: params.id,
      prNo: before.paperFormNo ?? before.code,
      title: before.title ?? null,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.fullName,
      creatorUserId: before.requestedBy,
      reason: body.data.reason,
      closedAtIssued: row.closedAtIssued,
      extraOnly: row.extraOnly,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "reject PR failed");
    return jsonError("INTERNAL", "Không từ chối được PR.", 500);
  }
}
