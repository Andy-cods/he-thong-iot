import { NextResponse, type NextRequest } from "next/server";
import { poCancelCloseSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { POTransitionError, closePO } from "@/server/repos/purchaseOrders";
import { getPR, markPRGoodsReceived } from "@/server/repos/purchaseRequests";
import { findActiveInvoiceForPo } from "@/server/repos/poInvoice";
import { db } from "@/lib/db";
import { notifyPOClosed } from "@/server/services/notifications";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { forbidden, hasRole, requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.1 TM-17 — POST /api/purchase-orders/[id]/close `{ reason }`
 *
 * Đóng PO PARTIAL (NCC không giao nốt) hoặc RECEIVED (chốt hồ sơ) → CLOSED.
 * Sau khi đóng không nhận thêm hàng. PR gốc được ghi mốc "Đã nhận hàng" để
 * luồng YCVT đi tiếp. Quyền: Thu mua + Giám đốc.
 * Thông báo PO_CLOSED → Kho (thôi chờ phần còn lại) + Kế toán (đối chiếu/lập
 * HĐ mua theo SL thực nhận) + người đề xuất PR.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;
  if (!hasRole(guard.session, "purchaser")) return forbidden();

  const body = await parseJson(req, poCancelCloseSchema);
  if ("response" in body) return body.response;

  try {
    const row = await closePO(params.id, guard.session.userId, body.data.reason);
    const from = (row.metadata as { closedFromStatus?: string } | null)
      ?.closedFromStatus;
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_order",
      objectId: row.id,
      before: { status: from ?? null },
      after: { status: row.status, reason: body.data.reason },
      notes: `Đóng PO: ${body.data.reason}`,
      ...extractRequestMeta(req),
    });
    if (row.prId) void markPRGoodsReceived(row.prId).catch(() => {});
    const [pr, invoice] = await Promise.all([
      row.prId ? getPR(row.prId).catch(() => null) : null,
      findActiveInvoiceForPo(db, row.id).catch(() => null),
    ]);
    void notifyPOClosed({
      poId: row.id,
      poNo: row.poNo,
      reason: body.data.reason,
      fromStatus: from ?? null,
      invoiceNo: invoice?.invoiceNo ?? null,
      creatorUserId: row.createdBy,
      prId: row.prId,
      prRequesterUserId: pr?.requestedBy ?? null,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
    });
    return NextResponse.json({ data: row });
  } catch (err) {
    if (err instanceof POTransitionError) {
      return jsonError(err.code, err.message, err.status);
    }
    logger.error({ err, id: params.id }, "close PO failed");
    return jsonError("INTERNAL", "Không đóng được PO.", 500);
  }
}
