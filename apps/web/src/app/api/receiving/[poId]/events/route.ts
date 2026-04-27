import { NextResponse, type NextRequest } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import {
  inboundReceipt,
  inboundReceiptLine,
  item,
  receivingEvent,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { getPO } from "@/server/repos/purchaseOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/receiving/[poId]/events — V3.2 audit history.
 *
 * Trả về:
 *   - po: header info
 *   - receipts: header receipt records của PO (RCV-yymm-NNNN)
 *   - receiptLines: chi tiết từng line trong receipt (joined item)
 *   - scanEvents: receiving_event raw scans (cho audit barcode/timestamp)
 *
 * RBAC: `read` `po`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { poId: string } },
) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;

  const poId = params.poId;
  if (!poId || !/^[0-9a-f-]{36}$/.test(poId)) {
    return jsonError("INVALID_PO_ID", "PO id không hợp lệ", 400);
  }

  try {
    const po = await getPO(poId);
    if (!po) return jsonError("PO_NOT_FOUND", "PO không tồn tại", 404);

    // 1) Inbound receipts của PO
    const receipts = await db
      .select({
        id: inboundReceipt.id,
        receiptNo: inboundReceipt.receiptNo,
        receivedAt: inboundReceipt.receivedAt,
        receivedBy: inboundReceipt.receivedBy,
        qcFlag: inboundReceipt.qcFlag,
        qcNotes: inboundReceipt.qcNotes,
      })
      .from(inboundReceipt)
      .where(eq(inboundReceipt.poId, poId))
      .orderBy(desc(inboundReceipt.receivedAt));

    const receiptIds = receipts.map((r) => r.id);

    // 2) Lines của tất cả receipts
    const lines = receiptIds.length > 0
      ? await db
          .select({
            id: inboundReceiptLine.id,
            receiptId: inboundReceiptLine.receiptId,
            poLineId: inboundReceiptLine.poLineId,
            itemId: inboundReceiptLine.itemId,
            itemSku: item.sku,
            itemName: item.name,
            itemUom: item.uom,
            receivedQty: inboundReceiptLine.receivedQty,
            lotCode: inboundReceiptLine.lotCode,
            serialCode: inboundReceiptLine.serialCode,
            notes: inboundReceiptLine.notes,
          })
          .from(inboundReceiptLine)
          .leftJoin(item, eq(item.id, inboundReceiptLine.itemId))
          .where(inArray(inboundReceiptLine.receiptId, receiptIds))
      : [];

    // 3) Scan events theo poCode (receivingEvent dùng poCode chứ không phải poId)
    const events = await db
      .select({
        id: receivingEvent.id,
        scanId: receivingEvent.scanId,
        poCode: receivingEvent.poCode,
        sku: receivingEvent.sku,
        qty: receivingEvent.qty,
        lotNo: receivingEvent.lotNo,
        qcStatus: receivingEvent.qcStatus,
        scannedAt: receivingEvent.scannedAt,
        receivedBy: receivingEvent.receivedBy,
        rawCode: receivingEvent.rawCode,
        metadata: receivingEvent.metadata,
        receivedAt: receivingEvent.receivedAt,
      })
      .from(receivingEvent)
      .where(eq(receivingEvent.poCode, po.poNo))
      .orderBy(desc(receivingEvent.scannedAt))
      .limit(200);

    return NextResponse.json({
      data: {
        po: { id: po.id, poNo: po.poNo, status: po.status },
        receipts,
        receiptLines: lines,
        scanEvents: events,
      },
    });
  } catch (e) {
    return jsonError("RECEIVING_AUDIT_FAILED", (e as Error).message ?? "Không lấy được lịch sử nhận hàng", 500);
  }
}
