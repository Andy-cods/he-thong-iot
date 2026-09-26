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
  available_on_hand: string;
  issuable: string;
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
    // V4.1 KHO-16 — tổng hợp từ view tồn chuẩn app.v_lot_stock (0059).
    const summaryRows = (await db.execute(sql`
      SELECT
        COALESCE(SUM(on_hand) FILTER (WHERE status = 'AVAILABLE'), 0)::text AS available_on_hand,
        COALESCE(SUM(on_hand) FILTER (WHERE status = 'HOLD'), 0)::text      AS hold,
        COALESCE(SUM(on_hand) FILTER (WHERE status = 'CONSUMED'), 0)::text  AS consumed,
        COALESCE(SUM(on_hand) FILTER (WHERE status = 'EXPIRED'), 0)::text   AS expired,
        COALESCE(SUM(on_hand), 0)::text      AS total,
        COALESCE(SUM(reserved), 0)::text     AS reserved,
        COALESCE(SUM(issuable_qty), 0)::text AS issuable
      FROM app.v_lot_stock
      WHERE item_id = ${itemId}
    `)) as unknown as LotSummaryRow[];

    const s = summaryRows[0] ?? {
      available_on_hand: "0",
      hold: "0",
      consumed: "0",
      expired: "0",
      total: "0",
      reserved: "0",
      issuable: "0",
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
        v.on_hand::text AS on_hand
      FROM app.inventory_lot_serial l
      JOIN app.v_lot_stock v ON v.lot_serial_id = l.id
      WHERE l.item_id = ${itemId}
      ORDER BY l.created_at DESC
      LIMIT 5
    `)) as unknown as RecentLotRow[];

    return NextResponse.json({
      data: {
        summary: {
          // V4.1 — "Khả dụng" = issuable (lô AVAILABLE − giữ chỗ ACTIVE).
          availableQty: Number(s.issuable),
          availableOnHandQty: Number(s.available_on_hand),
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
