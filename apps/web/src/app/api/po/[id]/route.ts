import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { item, locationBin, purchaseOrder, purchaseOrderLine, supplier } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/po/[id] — PWA receiving endpoint.
 *
 * V1.8 Batch 6: đọc DB thật (bỏ demo* stub) khi id là UUID hợp lệ.
 * Giữ fallback demo stub `demo | demo-small | demo-large` cho regression test
 * PWA vẫn dùng (hard-coded link từ hub).
 *
 * Response shape phục vụ 2 consumer:
 *   - PWA `<ReceivingConsole>` (legacy): poId/poCode/supplierName/expectedDate/lines
 *   - `/receiving/[poId]` form mới: lines thêm orderedQty/receivedQty/remainingQty
 *     + header thêm status/totals để render progress bar + disable "Hoàn tất".
 *
 * Auth: read po.
 */

interface POLine {
  lineNo: number;
  sku: string;
  itemName: string;
  /** Legacy field cho PWA ReceivingConsole — bằng orderedQty. */
  expectedQty: number;
  uom: string;
  // V1.8 Batch 6 enriched fields
  id?: string;
  itemId?: string;
  orderedQty?: number;
  receivedQty?: number;
  remainingQty?: number;
  unitPrice?: number;
  expectedLotSerial?: "LOT" | "SERIAL" | "NONE";
  /** V3.7 — bin slotting cho auto-putaway suggest. */
  defaultBinId?: string | null;
  defaultBinCode?: string | null;
}

interface POStub {
  poId: string;
  poCode: string;
  supplierName: string;
  supplierId?: string;
  supplierCode?: string | null;
  expectedDate: string;
  status?: "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED" | "CANCELLED" | "CLOSED";
  notes?: string | null;
  lines: POLine[];
  totals?: {
    linesTotal: number;
    orderedTotal: number;
    receivedTotal: number;
    receivedPct: number;
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;

  const rawId = params.id;

  if (!UUID_RE.test(rawId)) {
    return jsonError("PO_NOT_FOUND", "Mã PO không hợp lệ.", 404);
  }

  const [po] = await db
    .select({
      id: purchaseOrder.id,
      poNo: purchaseOrder.poNo,
      status: purchaseOrder.status,
      supplierId: purchaseOrder.supplierId,
      supplierName: supplier.name,
      supplierCode: supplier.code,
      expectedEta: purchaseOrder.expectedEta,
      notes: purchaseOrder.notes,
    })
    .from(purchaseOrder)
    .leftJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(eq(purchaseOrder.id, rawId))
    .limit(1);

  if (!po) {
    return jsonError("PO_NOT_FOUND", "Không tìm thấy PO.", 404);
  }

  const linesRows = await db
    .select({
      id: purchaseOrderLine.id,
      lineNo: purchaseOrderLine.lineNo,
      itemId: purchaseOrderLine.itemId,
      sku: item.sku,
      itemName: item.name,
      uom: item.uom,
      isLotTracked: item.isLotTracked,
      isSerialTracked: item.isSerialTracked,
      orderedQty: purchaseOrderLine.orderedQty,
      receivedQty: purchaseOrderLine.receivedQty,
      unitPrice: purchaseOrderLine.unitPrice,
      defaultBinId: item.defaultBinId,
      defaultBinCode: locationBin.fullCode,
    })
    .from(purchaseOrderLine)
    .leftJoin(item, eq(item.id, purchaseOrderLine.itemId))
    .leftJoin(locationBin, eq(locationBin.id, item.defaultBinId))
    .where(eq(purchaseOrderLine.poId, rawId))
    .orderBy(purchaseOrderLine.lineNo);

  let orderedTotal = 0;
  let receivedTotal = 0;

  const lines: POLine[] = linesRows.map((r) => {
    const orderedQty = toNumber(r.orderedQty);
    const receivedQty = toNumber(r.receivedQty);
    const remainingQty = Math.max(0, orderedQty - receivedQty);
    orderedTotal += orderedQty;
    receivedTotal += receivedQty;
    const expectedLotSerial: "LOT" | "SERIAL" | "NONE" = r.isSerialTracked
      ? "SERIAL"
      : r.isLotTracked
        ? "LOT"
        : "NONE";
    return {
      id: r.id,
      lineNo: r.lineNo,
      itemId: r.itemId,
      sku: r.sku ?? "",
      itemName: r.itemName ?? "",
      uom: (r.uom as string | null) ?? "",
      orderedQty,
      receivedQty,
      remainingQty,
      expectedQty: orderedQty, // legacy PWA alias
      unitPrice: toNumber(r.unitPrice),
      expectedLotSerial,
      defaultBinId: r.defaultBinId,
      defaultBinCode: r.defaultBinCode,
    };
  });

  const receivedPct =
    orderedTotal > 0 ? Math.round((receivedTotal / orderedTotal) * 100) : 0;

  const data: POStub = {
    poId: po.id,
    poCode: po.poNo,
    supplierId: po.supplierId,
    supplierName: po.supplierName ?? "Nhà cung cấp chưa gán",
    supplierCode: po.supplierCode ?? null,
    expectedDate: po.expectedEta ?? "",
    status: po.status,
    notes: po.notes,
    lines,
    totals: {
      linesTotal: lines.length,
      orderedTotal,
      receivedTotal,
      receivedPct,
    },
  };

  return NextResponse.json({ data });
}
