import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * V1.3 Lot/Serial history — union timeline từ 3 bảng:
 *   inventory_txn + reservation + assembly_scan
 * Dùng cho page /lot-serial/[id].
 */

export interface LotTimelineEvent {
  eventAt: string;
  kind: "TXN" | "RESERVE" | "RELEASE" | "SCAN";
  txType?: string | null;
  qty: number;
  note: string | null;
  actorUsername?: string | null;
  refTable: string | null;
  refId: string | null;
}

export interface LotDetail {
  lot: {
    id: string;
    itemId: string;
    lotCode: string | null;
    serialCode: string | null;
    mfgDate: string | null;
    expDate: string | null;
    status: string;
    holdReason: string | null;
    createdAt: string;
    itemSku: string | null;
    itemName: string | null;
  };
  onHandQty: number;
  reservedQty: number;
  timeline: LotTimelineEvent[];
}

export async function getLotHistory(lotId: string): Promise<LotDetail | null> {
  const lotRows = (await db.execute(sql`
    SELECT l.id, l.item_id, l.lot_code, l.serial_code,
           l.mfg_date, l.exp_date, l.status, l.hold_reason, l.created_at,
           i.sku AS item_sku, i.name AS item_name
      FROM app.inventory_lot_serial l
      LEFT JOIN app.item i ON i.id = l.item_id
     WHERE l.id = ${lotId}
     LIMIT 1
  `)) as unknown as Array<{
    id: string;
    item_id: string;
    lot_code: string | null;
    serial_code: string | null;
    mfg_date: string | null;
    exp_date: string | null;
    status: string;
    hold_reason: string | null;
    created_at: string;
    item_sku: string | null;
    item_name: string | null;
  }>;
  const lot = lotRows[0];
  if (!lot) return null;

  // On-hand + reserved
  const stockRows = (await db.execute(sql`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
          WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
          ELSE 0
        END
      ), 0)::numeric AS on_hand,
      COALESCE((
        SELECT SUM(reserved_qty) FROM app.reservation
         WHERE lot_serial_id = ${lotId} AND status='ACTIVE'
      ), 0)::numeric AS reserved
    FROM app.inventory_txn t
    WHERE t.lot_serial_id = ${lotId}
  `)) as unknown as Array<{ on_hand: string; reserved: string }>;
  const onHand = Number(stockRows[0]?.on_hand ?? 0);
  const reserved = Number(stockRows[0]?.reserved ?? 0);

  // Union timeline
  const timelineRows = (await db.execute(sql`
    WITH events AS (
      SELECT
        t.occurred_at AS event_at,
        'TXN'::text AS kind,
        t.tx_type::text AS tx_type,
        t.qty::numeric AS qty,
        t.notes AS note,
        u.username AS actor_username,
        t.ref_table,
        t.ref_id
      FROM app.inventory_txn t
      LEFT JOIN app.user_account u ON u.id = t.posted_by
      WHERE t.lot_serial_id = ${lotId}
      UNION ALL
      SELECT
        r.reserved_at AS event_at,
        'RESERVE'::text AS kind,
        NULL AS tx_type,
        r.reserved_qty::numeric AS qty,
        r.notes AS note,
        u.username AS actor_username,
        'reservation'::text AS ref_table,
        r.id AS ref_id
      FROM app.reservation r
      LEFT JOIN app.user_account u ON u.id = r.reserved_by
      WHERE r.lot_serial_id = ${lotId}
      UNION ALL
      SELECT
        r.released_at AS event_at,
        'RELEASE'::text AS kind,
        NULL AS tx_type,
        r.reserved_qty::numeric AS qty,
        r.release_reason AS note,
        u.username AS actor_username,
        'reservation'::text AS ref_table,
        r.id AS ref_id
      FROM app.reservation r
      LEFT JOIN app.user_account u ON u.id = r.released_by
      WHERE r.lot_serial_id = ${lotId} AND r.released_at IS NOT NULL
      UNION ALL
      SELECT
        s.scanned_at AS event_at,
        'SCAN'::text AS kind,
        s.scan_kind::text AS tx_type,
        s.qty::numeric AS qty,
        NULL AS note,
        u.username AS actor_username,
        'assembly_scan'::text AS ref_table,
        s.id AS ref_id
      FROM app.assembly_scan s
      LEFT JOIN app.user_account u ON u.id = s.scanned_by
      WHERE s.lot_serial_id = ${lotId}
    )
    SELECT * FROM events ORDER BY event_at ASC
  `)) as unknown as Array<{
    event_at: string;
    kind: "TXN" | "RESERVE" | "RELEASE" | "SCAN";
    tx_type: string | null;
    qty: string;
    note: string | null;
    actor_username: string | null;
    ref_table: string | null;
    ref_id: string | null;
  }>;

  return {
    lot: {
      id: lot.id,
      itemId: lot.item_id,
      lotCode: lot.lot_code,
      serialCode: lot.serial_code,
      mfgDate: lot.mfg_date,
      expDate: lot.exp_date,
      status: lot.status,
      holdReason: lot.hold_reason,
      createdAt: lot.created_at,
      itemSku: lot.item_sku,
      itemName: lot.item_name,
    },
    onHandQty: onHand,
    reservedQty: reserved,
    timeline: timelineRows.map((r) => ({
      eventAt: r.event_at,
      kind: r.kind,
      txType: r.tx_type,
      qty: Number(r.qty),
      note: r.note,
      actorUsername: r.actor_username,
      refTable: r.ref_table,
      refId: r.ref_id,
    })),
  };
}
