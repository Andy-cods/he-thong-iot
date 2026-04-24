import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { item, itemBarcode } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V1.8 Batch 7 — Lookup item bằng barcode (scan từ BOM workspace).
 *
 * Không phân biệt SKU vs barcode: fallback 2 bước.
 *   1. JOIN `app.item_barcode` theo `barcode = :code` (ưu tiên).
 *   2. Nếu không tìm thấy, thử match `item.sku = :code` (scanner gun đôi
 *      khi quét trực tiếp SKU code đã in sẵn).
 *
 * Trả `{ data: null }` + HTTP 200 khi không tìm thấy (để client xử lý UX
 * gracefully thay vì throw 404).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireCan(req, "read", "item");
  if ("response" in guard) return guard.response;

  const raw = decodeURIComponent(params.code ?? "").trim();
  if (!raw) {
    return jsonError("BAD_REQUEST", "Barcode không hợp lệ.", 400);
  }

  try {
    // 1) Lookup qua item_barcode
    const byBarcode = await db
      .select({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        type: item.itemType,
        uom: item.uom,
        status: item.status,
        barcode: itemBarcode.barcode,
      })
      .from(itemBarcode)
      .innerJoin(item, eq(item.id, itemBarcode.itemId))
      .where(eq(itemBarcode.barcode, raw))
      .limit(1);

    if (byBarcode[0]) {
      return NextResponse.json({ data: byBarcode[0] });
    }

    // 2) Fallback: match theo SKU
    const bySku = await db
      .select({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        type: item.itemType,
        uom: item.uom,
        status: item.status,
      })
      .from(item)
      .where(eq(item.sku, raw))
      .limit(1);

    if (bySku[0]) {
      return NextResponse.json({
        data: { ...bySku[0], barcode: null as string | null },
      });
    }

    return NextResponse.json({ data: null });
  } catch (err) {
    logger.error({ err, code: raw }, "items by-barcode lookup failed");
    return jsonError("INTERNAL", "Không tra cứu được linh kiện.", 500);
  }
}
