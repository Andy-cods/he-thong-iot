import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import {
  decidePoAutoApproval,
  poAutoApproveBlockedMessage,
} from "@/lib/procurement-policy";
import {
  getPOLines,
  submitPOForApproval,
} from "@/server/repos/purchaseOrders";
import { getPR } from "@/server/repos/purchaseRequests";
import {
  notifyPOApprovalRequested,
  notifyPOApproved,
} from "@/server/services/notifications";
import { extractRequestMeta, jsonError, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { forbidden, hasRole, requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-orders/[id]/submit-approval
 *
 * V1.9-P9: PO DRAFT đang có metadata.approvalStatus = undefined/null →
 * chuyển sang "pending", ghi submittedBy + submittedAt. Chỉ DRAFT.
 * Role: planner/admin (update permission).
 *
 * V4.9 — PO gắn phiếu đề xuất, đủ giá, VND, tổng < ngưỡng (env PO_AUTO_APPROVE_LIMIT_VND,
 * mặc định 20 triệu) được TỰ DUYỆT ngay (approvalStatus="approved", status vẫn DRAFT —
 * Mua hàng vẫn bấm "Gửi NCC"). Còn lại → "pending" chờ Giám đốc như cũ.
 * Response: `{ data, approval: { auto, reason, message } }`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "po");
  if ("response" in guard) return guard.response;
  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  if (!hasRole(guard.session, "planner", "purchaser")) return forbidden();

  // V4.4.3 — chủ xưởng: hàng CHƯA BIẾT GIÁ vẫn được gửi duyệt (bổ sung giá sau
  // bằng điều chỉnh giá). Trang PO hiện băng cảnh báo "N dòng chưa có giá";
  // công nợ chỉ ghi khi Kế toán xác nhận HĐ mua theo số trên hoá đơn thật.

  try {
    const limit = env.PO_AUTO_APPROVE_LIMIT_VND;
    const row = await submitPOForApproval(params.id, guard.session.userId, {
      autoApproveLimit: limit,
    });
    if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

    const approvalStatus = (row.metadata as { approvalStatus?: string } | null)
      ?.approvalStatus;
    const auto = approvalStatus === "approved";
    const meta = extractRequestMeta(req);

    let approval: { auto: boolean; reason: string; message: string };
    if (auto) {
      approval = {
        auto: true,
        reason: "UNDER_LIMIT",
        message: "PO dưới ngưỡng — đã tự duyệt, có thể gửi NCC.",
      };
      await writeAudit({
        actor: guard.session,
        action: "APPROVE",
        objectType: "purchase_order",
        objectId: params.id,
        after: {
          approvalStatus: "approved",
          autoApproved: true,
          autoApproveReason: "UNDER_LIMIT",
          autoApproveLimit: limit,
          totalAmount: row.totalAmount,
        },
        notes: "Tự duyệt PO dưới ngưỡng",
        ...meta,
      });
      const pr = row.prId ? await getPR(row.prId).catch(() => null) : null;
      void notifyPOApproved({
        poId: row.id,
        poNo: row.poNo,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.fullName,
        creatorUserId: row.createdBy,
        submitterUserId: guard.session.userId,
        prId: row.prId,
        prRequesterUserId: pr?.requestedBy ?? null,
        auto: true,
        autoApproveLimit: limit,
      });
    } else {
      // Lý do phải chờ Giám đốc (để UI giải thích) — tính lại trên dữ liệu PO hiện tại.
      const lines = await getPOLines(row.id);
      const d = decidePoAutoApproval({
        prId: row.prId,
        currency: row.currency,
        totalAmount: row.totalAmount ?? 0,
        lines,
        limit,
      });
      approval = {
        auto: false,
        reason: d.reason,
        message: poAutoApproveBlockedMessage(d.reason, limit),
      };
      // V4.1 TM-07 — báo Giám đốc (người duyệt PO duy nhất) có PO chờ duyệt.
      void notifyPOApprovalRequested({
        poId: row.id,
        poNo: row.poNo,
        totalAmount: row.totalAmount,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.fullName,
      });
      await writeAudit({
        actor: guard.session,
        action: "UPDATE",
        objectType: "purchase_order",
        objectId: params.id,
        after: { approvalStatus: "pending" },
        notes: "Gửi duyệt PO",
        ...meta,
      });
    }

    return NextResponse.json({ data: row, approval });
  } catch (err) {
    logger.error({ err, id: params.id }, "submit PO approval failed");
    const msg = (err as Error).message ?? "";
    if (msg.includes("NOT_SUBMITTABLE")) {
      return jsonError(
        "INVALID_STATE",
        "PO phải ở trạng thái Nháp và chưa chờ duyệt/đã bị từ chối.",
        409,
      );
    }
    return jsonError("INTERNAL", "Không gửi duyệt được PO.", 500);
  }
}
