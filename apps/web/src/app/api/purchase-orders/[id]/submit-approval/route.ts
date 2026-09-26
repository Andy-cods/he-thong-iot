import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import {
  getPOLines,
  submitPOForApproval,
} from "@/server/repos/purchaseOrders";
import { findUnpricedPoLines } from "@/lib/procurement-policy";
import { notifyPOApprovalRequested } from "@/server/services/notifications";
import { extractRequestMeta, jsonError } from "@/server/http";
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
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "po");
  if ("response" in guard) return guard.response;
  if (!hasRole(guard.session, "planner", "purchaser")) return forbidden();

  // V4.1 TM-10 — PO phải có đủ đơn giá trước khi gửi duyệt.
  const unpriced = findUnpricedPoLines(await getPOLines(params.id));
  if (unpriced.length > 0) {
    return jsonError(
      "UNPRICED_LINES",
      `PO còn ${unpriced.length} dòng chưa có đơn giá (dòng ${unpriced.join(", ")}) — nhập giá trước khi gửi duyệt.`,
      409,
      { lineNos: unpriced },
    );
  }

  try {
    const row = await submitPOForApproval(params.id, guard.session.userId);
    if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

    // V4.1 TM-07 — báo Giám đốc (người duyệt PO duy nhất) có PO chờ duyệt.
    void notifyPOApprovalRequested({
      poId: row.id,
      poNo: row.poNo,
      totalAmount: row.totalAmount,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_order",
      objectId: params.id,
      after: { approvalStatus: "pending" },
      notes: "Gửi duyệt PO",
      ...meta,
    });

    return NextResponse.json({ data: row });
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
