import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V1.7-beta.2 Phase C3 — Inventory summary 1 item cho BOM Grid Pro
 * InventoryPopover. Aggregate qua `inventory_txn` (transaction-first) + join
 * `inventory_lot_serial` để tách theo lot status (AVAILABLE/HOLD/CONSUMED),
 * kèm reservation ACTIVE. Trả về top 5 lot mới nhất (ORDER BY created_at DESC).
 *
 * Lot status V1 schema: AVAILABLE · HOLD · CONSUMED · EXPIRED. Không có
 * RESERVED/INBOUND_QC — reserved qty lấy từ bảng `reservation`.
 */

interface LotSummaryRow {
  available: string;
  hold: string;
  consumed: string;
  expired: string;
  total: string;
  reserved: string;
}

interface RecentLotRow {
  id: string;
  lot_code: string | null;
  serial_code: string | null;
  status: string;
  on_hand: string;
  exp_date: string | null;
  created_at: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "item");
  if ("response" in guard) return guard.response;

  const itemId = params.id;
  if (!itemId || itemId.length < 8) {
    return jsonError("BAD_REQUEST", "itemId không hợp lệ.", 400);
  }

  try {
    // Aggregate qty theo lot status (gom qua inventory_txn)
    const summaryRows = (await db.execute(sql`
      WITH lot_on_hand AS (
        SELECT
          l.id,
          l.status,
          COALESCE(SUM(
            CASE
              WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
              WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
              ELSE 0
            END
          ), 0)::numeric AS on_hand
        FROM app.inventory_lot_serial l
        LEFT JOIN app.inventory_txn t ON t.lot_serial_id = l.id
        WHERE l.item_id = ${itemId}
        GROUP BY l.id, l.status
      )
      SELECT
        COALESCE(SUM(CASE WHEN status = 'AVAILABLE' THEN on_hand END), 0)::text AS available,
        COALESCE(SUM(CASE WHEN status = 'HOLD'      THEN on_hand END), 0)::text AS hold,
        COALESCE(SUM(CASE WHEN status = 'CONSUMED'  THEN on_hand END), 0)::text AS consumed,
        COALESCE(SUM(CASE WHEN status = 'EXPIRED'   THEN on_hand END), 0)::text AS expired,
        COALESCE(SUM(on_hand), 0)::text AS total,
        COALESCE((
          SELECT SUM(r.reserved_qty)
          FROM app.reservation r
          JOIN app.inventory_lot_serial ll ON ll.id = r.lot_serial_id
          WHERE ll.item_id = ${itemId} AND r.status = 'ACTIVE'
        ), 0)::text AS reserved
      FROM lot_on_hand
    `)) as unknown as LotSummaryRow[];

    const s = summaryRows[0] ?? {
      available: "0",
      hold: "0",
      consumed: "0",
      expired: "0",
      total: "0",
      reserved: "0",
    };

    // Top 5 lots gần nhất
    const lotsRows = (await db.execute(sql`
      SELECT
        l.id::text,
        l.lot_code,
        l.serial_code,
        l.status::text,
        l.exp_date::text,
        l.created_at::text,
        COALESCE(SUM(
          CASE
            WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
            WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
            ELSE 0
          END
        ), 0)::text AS on_hand
      FROM app.inventory_lot_serial l
      LEFT JOIN app.inventory_txn t ON t.lot_serial_id = l.id
      WHERE l.item_id = ${itemId}
      GROUP BY l.id, l.lot_code, l.serial_code, l.status, l.exp_date, l.created_at
      ORDER BY l.created_at DESC
      LIMIT 5
    `)) as unknown as RecentLotRow[];

    return NextResponse.json({
      data: {
        summary: {
          availableQty: Number(s.available),
          holdQty: Number(s.hold),
          consumedQty: Number(s.consumed),
          expiredQty: Number(s.expired),
          totalQty: Number(s.total),
          reservedQty: Number(s.reserved),
        },
        lots: lotsRows.map((r) => ({
          id: r.id,
          lotCode: r.lot_code,
          serialCode: r.serial_code,
          status: r.status,
          onHandQty: Number(r.on_hand),
          expDate: r.exp_date,
          createdAt: r.created_at,
        })),
      },
    });
  } catch (err) {
    logger.error({ err, itemId }, "inventory-summary failed");
    return jsonError("INTERNAL", "Không tải được tồn kho.", 500);
  }
}
