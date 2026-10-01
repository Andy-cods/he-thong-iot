import { NextResponse, type NextRequest } from "next/server";
import { poApproveSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { approvePO, getPO } from "@/server/repos/purchaseOrders";
import {
  isSelfApprovalBlocked,
} from "@/lib/procurement-policy";
import { getPR } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPOApproved } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-orders/[id]/approve
 *
 * V1.9-P9: duyệt PO DRAFT → metadata.approvalStatus = "approved".
 * Role: admin (approve permission).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "po");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, poApproveSchema);
  if ("response" in body) return body.response;

  const before = await getPO(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

  // V4.1 D8 — người lập / người gửi duyệt không tự duyệt PO của mình (trừ
  // admin). Hiện chỉ admin có `approve:po`; guard này chặn trường hợp cấp quyền
  // riêng (permission override) cho người khác.
  const submittedBy = (before.metadata as { submittedBy?: string } | null)
    ?.submittedBy;
  if (
    isSelfApprovalBlocked({
      creatorId: before.createdBy,
      actorId: guard.session.userId,
      actorRoles: guard.session.roles,
    }) ||
    isSelfApprovalBlocked({
      creatorId: submittedBy ?? null,
      actorId: guard.session.userId,
      actorRoles: guard.session.roles,
    })
  ) {
    return jsonError(
      "SELF_APPROVAL",
      "Bạn là người lập/gửi duyệt PO này — cần người khác (Giám đốc) duyệt.",
      403,
    );
  }

  // V4.4.3 — cho duyệt PO còn dòng chưa có giá (giá chốt sau). Không sai công
  // nợ: công nợ phải trả chỉ phát sinh khi Kế toán xác nhận HĐ mua theo số thật.

  try {
    const row = await approvePO(
      params.id,
      guard.session.userId,
      body.data.notes ?? null,
    );
    if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "APPROVE",
      objectType: "purchase_order",
      objectId: params.id,
      after: { approvalStatus: "approved", notes: body.data.notes ?? null },
      notes: "Duyệt PO",
      ...meta,
    });

    // V4.0 Wave 3 Phase C — bổ sung notify còn thiếu: purchaser + warehouse +
    // người đề xuất PR gốc (nếu PO tạo từ PR). Trước đây route này không bắn
    // notify gì cả (gap thật).
    const pr = row.prId ? await getPR(row.prId) : null;
    void notifyPOApproved({
      poId: row.id,
      poNo: row.poNo,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.fullName,
      // TASK-20260927 — người lập + người gửi duyệt (có thể là Thiết kế) nhận kết quả.
      creatorUserId: row.createdBy,
      submitterUserId: submittedBy ?? null,
      prId: row.prId,
      prRequesterUserId: pr?.requestedBy ?? null,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err, id: params.id }, "approve PO failed");
    const msg = (err as Error).message ?? "";
    if (msg.includes("NOT_PENDING")) {
      return jsonError(
        "INVALID_STATE",
        "Chỉ PO đang chờ duyệt mới được phê duyệt.",
        409,
      );
    }
    return jsonError("INTERNAL", "Không duyệt được PO.", 500);
  }
}
