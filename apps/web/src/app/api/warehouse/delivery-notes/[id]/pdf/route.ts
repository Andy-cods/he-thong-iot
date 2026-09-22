import { type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { userAccount, warehouseIssueRequest } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import {
  getDeliveryNote,
  getDeliveryNoteLines,
} from "@/server/repos/deliveryNotes";
import { renderDeliveryNotePdfBuffer } from "@/server/services/deliveryNotePdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/warehouse/delivery-notes/[id]/pdf — tải PDF BBGH (3 liên).
 * Chỉ khả dụng khi phiếu đã CONFIRMED (= BBGH chính thức). Cho phép xem
 * trước bản DRAFT/PENDING_APPROVAL cũng OK (không chặn) — hữu ích để Kho
 * kiểm tra trước khi submit, chỉ khác là chưa có chữ ký Giám đốc trong dữ liệu.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "deliveryNote");
  if ("response" in guard) return guard.response;

  const note = await getDeliveryNote(params.id);
  if (!note) return jsonError("NOT_FOUND", "Không tìm thấy phiếu giao hàng.", 404);

  const lines = await getDeliveryNoteLines(params.id);

  const [issueRequest] = await db
    .select({ requestNo: warehouseIssueRequest.requestNo })
    .from(warehouseIssueRequest)
    .where(eq(warehouseIssueRequest.id, note.issueRequestId))
    .limit(1);

  const [deliverer] = await db
    .select({ fullName: userAccount.fullName })
    .from(userAccount)
    .where(eq(userAccount.id, note.deliveredBy))
    .limit(1);

  try {
    const buf = await renderDeliveryNotePdfBuffer({
      noteNo: note.noteNo,
      createdAt: note.createdAt,
      issueRequestNo: issueRequest?.requestNo ?? null,
      poCode: null,
      contractNo: note.contractNo,
      recipientName: note.recipientName,
      recipientAddress: note.recipientAddress,
      recipientContactName: note.recipientContactName,
      recipientPhone: note.recipientPhone,
      deliveredByName: deliverer?.fullName ?? null,
      vehicleType: note.vehicleType,
      vehiclePlate: note.vehiclePlate,
      carrierName: note.carrierName,
      carrierPhone: note.carrierPhone,
      deliveryResult: note.deliveryResult,
      conclusionNotes: note.conclusionNotes,
      lines: lines.map((l) => ({
        lineNo: l.lineNo,
        sku: l.sku,
        itemName: l.name,
        specification: l.specification,
        uom: l.uom ?? l.itemUom,
        docQty: l.docQty,
        actualQty: l.actualQty,
        condition: l.condition,
        notes: l.notes,
      })),
    });

    const safeNoteNo = note.noteNo.replace(/[/\\]/g, "-");
    const filename = `BBGH-${safeNoteNo}.pdf`;
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    const blob = new Blob([ab], { type: "application/pdf" });

    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error({ err }, "delivery-note export-pdf failed");
    return jsonError(
      "INTERNAL",
      `Không tạo được PDF: ${(err as Error).message}`,
      500,
    );
  }
}
