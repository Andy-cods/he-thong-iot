import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { directorApprovePR, getPR } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import {
  notifyPRApproved,
} from "@/server/services/notifications";
import { requireCan } from "@/server/session";
import { isSelfApprovalBlocked } from "@/lib/procurement-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  note: z.string().trim().max(2000).optional().nullable(),
});

/**
 * V3.7.69 YCVT — POST /api/purchase-requests/[id]/director-approve
 * Step 3/3: Giám đốc / Mua hàng duyệt. DEPT_APPROVED → DIRECTOR_APPROVED.
 * Đồng thời set status = APPROVED để chuyển sang flow tạo PO existing.
 *
 * Authorization: admin OR purchaser ("giám đốc"/"trưởng mua hàng").
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
  // Tách quyền cấp duyệt cuối khỏi quyền duyệt cấp Trưởng bộ phận. Matrix
  // chung không biểu diễn được hai stage khác nhau của cùng entity PR.
  if (
    !guard.session.roles.includes("admin") &&
    !guard.session.roles.includes("purchaser")
  ) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ Admin hoặc Bộ phận Mua hàng được duyệt cuối.",
      403,
    );
  }

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  if (before.approvalStep !== "DEPT_APPROVED") {
    return jsonError(
      "INVALID_STATE",
      `Phiếu đang ở bước ${before.approvalStep} — chỉ Giám đốc duyệt được khi đã qua Trưởng bộ phận.`,
      409,
    );
  }

  // V4.1 D8 — người lập phiếu không tự duyệt phiếu của mình (trừ admin).
  if (
    isSelfApprovalBlocked({
      creatorId: before.requestedBy,
      actorId: guard.session.userId,
      actorRoles: guard.session.roles,
    })
  ) {
    return jsonError(
      "SELF_APPROVAL",
      "Bạn là người lập phiếu này — cần người khác duyệt.",
      403,
    );
  }

  const body = await parseJson(req, inputSchema);
  if ("response" in body) return body.response;

  try {
    const row = await directorApprovePR(
      params.id,
      guard.session.userId,
      body.data.note ?? null,
    );
    if (!row) return jsonError("CONFLICT", "Phiếu đã thay đổi trạng thái.", 409);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "APPROVE",
      objectType: "purchase_request",
      objectId: params.id,
      before: { approvalStep: before.approvalStep, status: before.status },
      after: {
        approvalStep: row.approvalStep,
        status: row.status,
        directorApprovedBy: row.directorApprovedBy,
      },
      notes: body.data.note ?? "Giám đốc duyệt cuối",
      ...meta,
    });

    // TASK-20260927 — 1 lần gửi: Thu mua (tạo PO) + người lập + Kế toán (PDF),
    // người giữ nhiều vai trò chỉ nhận 1 thông báo.
    void notifyPRApproved({
      prId: params.id,
      prNo: before.paperFormNo ?? before.code,
      title: before.title ?? null,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.fullName,
      creatorUserId: before.requestedBy,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "director-approve PR failed");
    return jsonError("INTERNAL", "Không duyệt được phiếu.", 500);
  }
}
