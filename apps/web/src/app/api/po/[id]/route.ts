import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { item, purchaseOrder, purchaseOrderLine, supplier } from "@iot/db/schema";
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

const DEMO_POS: Record<string, POStub> = {
  demo: {
    poId: "demo",
    poCode: "PO-DEMO-001",
    supplierName: "NCC Demo",
    expectedDate: "2026-04-20",
    lines: [
      { lineNo: 1, sku: "RM-THEP-C45", itemName: "Thép C45 tấm 10mm", expectedQty: 50, uom: "KG" },
      { lineNo: 2, sku: "RM-BULON-M8", itemName: "Bu lông M8x25", expectedQty: 200, uom: "PCS" },
      { lineNo: 3, sku: "RM-DAU-ISO46", itemName: "Dầu bôi trơn ISO 46", expectedQty: 10, uom: "L" },
    ],
  },
  "demo-small": {
    poId: "demo-small",
    poCode: "PO-DEMO-SMALL",
    supplierName: "NCC Demo Small",
    expectedDate: "2026-04-20",
    lines: [
      { lineNo: 1, sku: "RM-THEP-C45", itemName: "Thép C45 tấm 10mm", expectedQty: 20, uom: "KG" },
    ],
  },
  "demo-large": {
    poId: "demo-large",
    poCode: "PO-DEMO-LARGE",
    supplierName: "NCC Demo Large",
    expectedDate: "2026-04-25",
    lines: [
      { lineNo: 1, sku: "RM-THEP-C45", itemName: "Thép C45 tấm 10mm", expectedQty: 200, uom: "KG" },
      { lineNo: 2, sku: "RM-THEP-S50C", itemName: "Thép S50C 20mm", expectedQty: 150, uom: "KG" },
      { lineNo: 3, sku: "RM-BULON-M8", itemName: "Bu lông M8x25", expectedQty: 500, uom: "PCS" },
      { lineNo: 4, sku: "RM-BULON-M10", itemName: "Bu lông M10x30", expectedQty: 300, uom: "PCS" },
      { lineNo: 5, sku: "RM-DAU-ISO46", itemName: "Dầu bôi trơn ISO 46", expectedQty: 30, uom: "L" },
      { lineNo: 6, sku: "RM-DAU-ISO68", itemName: "Dầu bôi trơn ISO 68", expectedQty: 20, uom: "L" },
      { lineNo: 7, sku: "RM-BANH-RANG-M2", itemName: "Bánh răng M2", expectedQty: 50, uom: "PCS" },
      { lineNo: 8, sku: "RM-VONG-BI-6205", itemName: "Vòng bi 6205", expectedQty: 80, uom: "PCS" },
    ],
  },
};

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
  const id = rawId.toLowerCase();

  // Fallback stub cho PWA demo path (back-compat V1.1-alpha).
  if (id.startsWith("demo")) {
    const po = DEMO_POS[id] ?? DEMO_POS.demo;
    return NextResponse.json({ data: po });
  }

  // V1.8 Batch 6 — DB thật.
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
    })
    .from(purchaseOrderLine)
    .leftJoin(item, eq(item.id, purchaseOrderLine.itemId))
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
