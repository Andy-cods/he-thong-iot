import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V1.7-beta.2.1 — GET `/api/lot-serial` list lot/serial có filter.
 *
 * Query:
 *   - `itemId` (uuid) → filter theo 1 item cụ thể (dùng cho popover → "Xem tất cả lot").
 *   - `status` (AVAILABLE|HOLD|CONSUMED|EXPIRED) → filter theo lot status.
 *   - `q` (text) → search lot_code / serial_code (ILIKE).
 *   - `page` default 1, `pageSize` default 50 (max 200).
 *
 * Response: `{ data: [...], meta: { page, pageSize, total } }`.
 */

const lotSerialListQuerySchema = z.object({
  itemId: z.string().uuid().optional(),
  status: z
    .enum(["AVAILABLE", "HOLD", "CONSUMED", "EXPIRED"])
    .optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

interface ListRow {
  id: string;
  lot_code: string | null;
  serial_code: string | null;
  status: string;
  mfg_date: string | null;
  exp_date: string | null;
  created_at: string;
  on_hand: string;
  item_id: string;
  item_sku: string | null;
  item_name: string | null;
  item_uom: string | null;
}

interface CountRow {
  total: string;
}

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "reservation");
  if ("response" in guard) return guard.response;

  const parsed = parseSearchParams(req, lotSerialListQuerySchema);
  if ("response" in parsed) return parsed.response;

  const { itemId, status, q, page, pageSize } = parsed.data;
  const offset = (page - 1) * pageSize;

  try {
    const rows = (await db.execute(sql`
      SELECT
        l.id::text AS id,
        l.lot_code,
        l.serial_code,
        l.status::text AS status,
        l.mfg_date::text AS mfg_date,
        l.exp_date::text AS exp_date,
        l.created_at::text AS created_at,
        l.item_id::text AS item_id,
        i.sku AS item_sku,
        i.name AS item_name,
        i.uom::text AS item_uom,
        COALESCE((
          SELECT SUM(
            CASE
              WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
              WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
              ELSE 0
            END
          ) FROM app.inventory_txn t WHERE t.lot_serial_id = l.id
        ), 0)::text AS on_hand
      FROM app.inventory_lot_serial l
      JOIN app.item i ON i.id = l.item_id
      WHERE 1=1
        ${itemId ? sql`AND l.item_id = ${itemId}` : sql``}
        ${status ? sql`AND l.status = ${status}::app.lot_status` : sql``}
        ${
          q
            ? sql`AND (l.lot_code ILIKE ${"%" + q + "%"} OR l.serial_code ILIKE ${"%" + q + "%"} OR i.sku ILIKE ${"%" + q + "%"})`
            : sql``
        }
      ORDER BY l.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `)) as unknown as ListRow[];

    const countRows = (await db.execute(sql`
      SELECT COUNT(*)::text AS total
      FROM app.inventory_lot_serial l
      JOIN app.item i ON i.id = l.item_id
      WHERE 1=1
        ${itemId ? sql`AND l.item_id = ${itemId}` : sql``}
        ${status ? sql`AND l.status = ${status}::app.lot_status` : sql``}
        ${
          q
            ? sql`AND (l.lot_code ILIKE ${"%" + q + "%"} OR l.serial_code ILIKE ${"%" + q + "%"} OR i.sku ILIKE ${"%" + q + "%"})`
            : sql``
        }
    `)) as unknown as CountRow[];

    const total = Number(countRows[0]?.total ?? "0");

    return NextResponse.json({
      data: rows.map((r) => ({
        id: r.id,
        lotCode: r.lot_code,
        serialCode: r.serial_code,
        status: r.status,
        mfgDate: r.mfg_date,
        expDate: r.exp_date,
        createdAt: r.created_at,
        onHandQty: Number(r.on_hand),
        itemId: r.item_id,
        itemSku: r.item_sku,
        itemName: r.item_name,
        itemUom: r.item_uom,
      })),
      meta: { page, pageSize, total },
    });
  } catch (err) {
    logger.error({ err }, "lot-serial list failed");
    return jsonError("INTERNAL", "Không tải được danh sách lot.", 500);
  }
}
