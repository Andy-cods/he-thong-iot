/**
 * V3.7.38 — GET /api/purchase-orders/[id]/pdf
 * Generate PO PDF theo template DDH-Mau (Đơn đặt hàng GTAM).
 *
 * Permissions: read po (mọi role). Trả binary PDF + filename.
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { supplier as supplierTable, userAccount } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { getPO, getPOLines } from "@/server/repos/purchaseOrders";
import { requireCan } from "@/server/session";
import { renderPoPdfBuffer, type POPdfLine } from "@/server/services/poPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;

  const po = await getPO(params.id);
  if (!po) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

  // V3.7.43 — Guard: DDH-Mau template chỉ dùng cho PO gia công ngoài.
  // PO commercial sẽ có template riêng V3.8+.
  if (po.poType !== "SUBCONTRACT") {
    return jsonError(
      "INVALID_PO_TYPE",
      "DDH PDF chỉ dùng cho PO Đặt gia công ngoài. PO Thương mại sẽ có mẫu riêng.",
      400,
    );
  }

  const lines = await getPOLines(params.id);

  // Lookup supplier info
  let sup: typeof supplierTable.$inferSelect | null = null;
  if (po.supplierId) {
    const [row] = await db
      .select()
      .from(supplierTable)
      .where(eq(supplierTable.id, po.supplierId))
      .limit(1);
    sup = row ?? null;
  }

  // Lookup preparedBy (createdBy) — fullName để hiển thị
  let preparedBy: string | null = null;
  const userIdToLookup = po.createdBy ?? null;
  if (userIdToLookup) {
    const [u] = await db
      .select({ fullName: userAccount.fullName, username: userAccount.username })
      .from(userAccount)
      .where(eq(userAccount.id, userIdToLookup))
      .limit(1);
    preparedBy = u?.fullName ?? u?.username ?? null;
  }

  // Compute subtotal + tax. Schema: totalAmount = SUM(qty × price × (1+tax)).
  const subtotal = lines.reduce(
    (acc, l) => acc + Number(l.orderedQty) * Number(l.unitPrice),
    0,
  );
  // Tax rate avg trên các line (giả định cùng rate). Default 10%.
  const firstTax = lines[0]?.taxRate;
  const taxRate = firstTax != null ? Number(firstTax) / 100 : 0.1;
  const total = subtotal * (1 + taxRate);

  const pdfLines: POPdfLine[] = lines.map((l) => ({
    lineNo: l.lineNo,
    itemSku: l.itemSku,
    itemName: l.itemName,
    itemUom: l.itemUom,
    spec: null, // TODO: pull từ BOM line snapshotLineId nếu có
    orderedQty: l.orderedQty,
    unitPrice: l.unitPrice,
    taxRate: l.taxRate,
    lineTotal: Number(l.orderedQty) * Number(l.unitPrice),
  }));

  try {
    const orderDate = po.orderDate
      ? new Date(po.orderDate)
      : po.createdAt
        ? new Date(po.createdAt)
        : new Date();
    const buffer = await renderPoPdfBuffer({
      poCode: po.poNo,
      orderDate,
      reference: null,
      supplier: {
        name: sup?.name ?? "—",
        code: sup?.code ?? null,
        address: sup?.address ?? sup?.streetAddress ?? null,
        taxCode: sup?.taxCode ?? null,
        phone: sup?.phone ?? null,
        email: sup?.email ?? null,
        contactName: sup?.contactName ?? null,
      },
      lines: pdfLines,
      subtotal,
      taxRate,
      total,
      notes: po.notes ?? null,
      preparedBy,
    });

    const filename = `${po.poNo.replace(/[^\w\-]+/g, "_")}.pdf`;
    // Buffer → Uint8Array để tương thích NextResponse BodyInit type.
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    const e = err as Error;
    logger.error({ err, poId: params.id, msg: e.message, stack: e.stack }, "PO PDF render failed");
    // V3.7.41 — return detail message để debug trên client.
    return jsonError(
      "INTERNAL",
      `Không tạo được PDF: ${e.message ?? "unknown"}`,
      500,
    );
  }
}
