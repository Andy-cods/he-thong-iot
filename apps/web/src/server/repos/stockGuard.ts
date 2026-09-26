/**
 * V4.1 Đợt 1a (KHO-05/06/10) — Guard DÙNG CHUNG cho MỌI đường xuất kho.
 *
 * Trước đây mỗi route (xuất nhanh, duyệt ISR, rút hàng, quét lắp ráp) tự kiểm
 * tồn theo cách riêng, không route nào kiểm trạng thái lô → xuất được lô HOLD
 * (chờ QC / QC hỏng), lô CONSUMED/EXPIRED; lại bỏ qua hàng đã giữ chỗ cho lệnh
 * SX. File này gom về MỘT chỗ:
 *
 *   1. Khoá `app.reservation_lock(item)` từng item distinct, SẮP XẾP theo id
 *      (cùng khoá với luồng giữ chỗ → số "đã giữ chỗ" đọc được là nhất quán).
 *   2. `SELECT … FROM inventory_lot_serial WHERE id = ANY(…) ORDER BY id
 *      FOR UPDATE` — khoá hàng lô (HOLD/nhả HOLD/QC chờ nhau).
 *   3. `evaluateIssuable()` THUẦN: lô tồn tại + đúng item; status thuộc
 *      `allowStatuses` (mặc định chỉ AVAILABLE); mỗi (bin, lô) tổng pick ≤ tồn
 *      bin; mỗi lô tổng pick ≤ on_hand − giữ chỗ ACTIVE + phần giữ chỗ của
 *      chính người gọi (lắp ráp tiêu hao reservation của nó).
 *
 * Thứ tự khoá cố định: item (sorted) → lô (sorted) → tránh deadlock giữa các
 * đường xuất. `SET LOCAL lock_timeout='5s'`: chờ quá lâu → 409 "thử lại".
 *
 * Lưới an toàn cuối ở DB: trigger `inventory_txn_lot_guard` (migration 0059)
 * chặn OUT_ISSUE/ASSEMBLY_CONSUME/PROD_OUT vào lô không AVAILABLE. Vì vậy
 * `postOutboundTxns` LUÔN insert inventory_txn TRƯỚC rồi mới đánh dấu lô
 * CONSUMED (ngược lại trigger sẽ chặn nhầm lượt xuất cuối cùng của lô).
 */
import { sql, type SQL } from "drizzle-orm";
import { inventoryTxn } from "@iot/db/schema";
import type { db as _db } from "@/lib/db";

/** Transaction handle của Drizzle (cùng kiểu callback db.transaction nhận). */
export type Tx = Parameters<Parameters<typeof _db.transaction>[0]>[0];

export type LotStatus = "AVAILABLE" | "HOLD" | "CONSUMED" | "EXPIRED";

export type StockGuardCode =
  | "INVALID_QTY"
  | "LOT_NOT_FOUND"
  | "ITEM_MISMATCH"
  | "LOT_NOT_AVAILABLE"
  | "INSUFFICIENT_BIN"
  | "INSUFFICIENT_FREE"
  | "LOCK_BUSY";

export class StockGuardError extends Error {
  constructor(
    public readonly code: StockGuardCode,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "StockGuardError";
  }
}

export interface IssuePick {
  itemId: string;
  lotSerialId: string;
  binId: string;
  qty: number;
}

export interface GuardLotRow {
  id: string;
  itemId: string;
  status: string;
  holdCode: string | null;
  lotCode?: string | null;
}

export interface EvaluateIssuableInput {
  picks: IssuePick[];
  lots: GuardLotRow[];
  /** Tồn theo (bin, lô) — từ view app.bin_inventory. */
  binStock: Array<{ binId: string; lotSerialId: string; qty: number }>;
  /** Tồn theo lô — từ view app.v_lot_stock. */
  lotStock: Array<{ lotSerialId: string; onHand: number; reserved: number }>;
  allowStatuses?: LotStatus[];
  ownReservations?: Array<{ lotSerialId: string; qty: number }>;
}

const EPS = 1e-6;

function fmtQty(n: number): string {
  return Number(n.toFixed(4)).toLocaleString("vi-VN");
}

function lotLabel(lot: GuardLotRow | undefined, id: string): string {
  return lot?.lotCode ? `Lô ${lot.lotCode}` : `Lô ${id.slice(0, 8)}`;
}

/** Diễn giải trạng thái lô cho thông báo lỗi tiếng Việt. */
export function describeLotState(status: string, holdCode: string | null): string {
  if (status === "HOLD") {
    if (holdCode === "QC_PENDING") return "đang chờ QC nhập kho";
    if (holdCode === "QC_FAIL") return "QC không đạt";
    return "đang bị giữ (HOLD)";
  }
  if (status === "CONSUMED") return "đã xuất hết";
  if (status === "EXPIRED") return "đã hết hạn";
  return status;
}

/**
 * THUẦN — kiểm tra 1 lượt xuất có hợp lệ không. Trả lỗi ĐẦU TIÊN gặp phải
 * (null = hợp lệ). Không chạm DB → test được bằng vitest.
 */
export function evaluateIssuable(
  input: EvaluateIssuableInput,
): StockGuardError | null {
  const allow = new Set<string>(input.allowStatuses ?? ["AVAILABLE"]);
  const lotById = new Map(input.lots.map((l) => [l.id, l]));

  // 1) SL + lô tồn tại + đúng item + trạng thái cho phép
  for (const p of input.picks) {
    if (!Number.isFinite(p.qty) || p.qty <= 0) {
      return new StockGuardError(
        "INVALID_QTY",
        "Số lượng xuất phải lớn hơn 0.",
        400,
      );
    }
    const lot = lotById.get(p.lotSerialId);
    if (!lot) {
      return new StockGuardError(
        "LOT_NOT_FOUND",
        `Không tìm thấy lô ${p.lotSerialId.slice(0, 8)} — dữ liệu chọn lô đã cũ, vui lòng tải lại.`,
      );
    }
    if (lot.itemId !== p.itemId) {
      return new StockGuardError(
        "ITEM_MISMATCH",
        `${lotLabel(lot, p.lotSerialId)} không thuộc mã hàng đang xuất.`,
      );
    }
    if (!allow.has(lot.status)) {
      return new StockGuardError(
        "LOT_NOT_AVAILABLE",
        `${lotLabel(lot, p.lotSerialId)} ${describeLotState(lot.status, lot.holdCode)} — không được xuất.`,
      );
    }
  }

  // 2) Tổng pick theo (bin, lô) ≤ tồn bin
  const binQty = new Map<string, number>();
  for (const b of input.binStock) {
    const k = `${b.binId}|${b.lotSerialId}`;
    binQty.set(k, (binQty.get(k) ?? 0) + b.qty);
  }
  const pickByBin = new Map<string, number>();
  for (const p of input.picks) {
    const k = `${p.binId}|${p.lotSerialId}`;
    pickByBin.set(k, (pickByBin.get(k) ?? 0) + p.qty);
  }
  for (const [k, want] of pickByBin) {
    const have = binQty.get(k) ?? 0;
    if (want > have + EPS) {
      const lotId = k.split("|")[1]!;
      return new StockGuardError(
        "INSUFFICIENT_BIN",
        `${lotLabel(lotById.get(lotId), lotId)} tại vị trí này chỉ còn ${fmtQty(have)}, không đủ xuất ${fmtQty(want)}.`,
      );
    }
  }

  // 3) Tổng pick theo lô ≤ on_hand − giữ chỗ ACTIVE + giữ chỗ của chính mình
  const stockByLot = new Map(input.lotStock.map((s) => [s.lotSerialId, s]));
  const ownByLot = new Map<string, number>();
  for (const r of input.ownReservations ?? []) {
    ownByLot.set(r.lotSerialId, (ownByLot.get(r.lotSerialId) ?? 0) + r.qty);
  }
  const pickByLot = new Map<string, number>();
  for (const p of input.picks) {
    pickByLot.set(p.lotSerialId, (pickByLot.get(p.lotSerialId) ?? 0) + p.qty);
  }
  for (const [lotId, want] of pickByLot) {
    const st = stockByLot.get(lotId);
    const onHand = st?.onHand ?? 0;
    const reserved = st?.reserved ?? 0;
    const own = Math.min(ownByLot.get(lotId) ?? 0, reserved);
    const free = Math.min(onHand, onHand - reserved + own);
    if (want > free + EPS) {
      const label = lotLabel(lotById.get(lotId), lotId);
      const msg =
        reserved - own > EPS
          ? `${label} còn ${fmtQty(onHand)} nhưng ${fmtQty(reserved - own)} đã giữ chỗ cho lệnh sản xuất — chỉ xuất được ${fmtQty(Math.max(free, 0))}.`
          : `${label} chỉ còn ${fmtQty(Math.max(onHand, 0))}, không đủ xuất ${fmtQty(want)}.`;
      return new StockGuardError("INSUFFICIENT_FREE", msg);
    }
  }

  return null;
}

/** ARRAY[$1::uuid, $2::uuid, …] — bind từng id làm tham số (không nội suy raw). */
export function uuidArray(ids: string[]): SQL {
  return sql`ARRAY[${sql.join(
    ids.map((x) => sql`${x}::uuid`),
    sql`, `,
  )}]::uuid[]`;
}

/**
 * Khoá theo thứ tự cố định: `app.reservation_lock(item)` (sorted) → hàng lô
 * `FOR UPDATE` (ORDER BY id). Dùng khi caller cần đọc dữ liệu phụ thuộc lô
 * (vd tồn theo bin) TRƯỚC khi dựng picks rồi mới `assertIssuable` — gọi lại
 * không sao (advisory lock + FOR UPDATE trong cùng transaction là re-entrant).
 */
export async function lockItemsAndLots(
  tx: Tx,
  itemIds: string[],
  lotIds: string[],
): Promise<void> {
  await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
  for (const itemId of [...new Set(itemIds)].sort()) {
    await tx.execute(sql`SELECT app.reservation_lock(${itemId}::uuid)`);
  }
  const lots = [...new Set(lotIds)].sort();
  if (lots.length > 0) {
    await tx.execute(sql`
      SELECT id FROM app.inventory_lot_serial
      WHERE id = ANY(${uuidArray(lots)})
      ORDER BY id
      FOR UPDATE
    `);
  }
}

/**
 * Khoá + kiểm tra 1 lượt xuất. Throw `StockGuardError` nếu không hợp lệ.
 * PHẢI gọi trong transaction, TRƯỚC khi insert inventory_txn.
 */
export async function assertIssuable(
  tx: Tx,
  picks: IssuePick[],
  opts: {
    allowStatuses?: LotStatus[];
    ownReservations?: Array<{ lotSerialId: string; qty: number }>;
  } = {},
): Promise<void> {
  if (picks.length === 0) return;

  await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);

  // 1) Khoá item theo thứ tự sort cố định (cùng khoá với luồng giữ chỗ).
  const itemIds = [...new Set(picks.map((p) => p.itemId))].sort();
  for (const itemId of itemIds) {
    await tx.execute(sql`SELECT app.reservation_lock(${itemId}::uuid)`);
  }

  // 2) Khoá hàng lô theo id (ORDER BY id → thứ tự cố định).
  const lotIds = [...new Set(picks.map((p) => p.lotSerialId))].sort();
  const lotRows = (await tx.execute(sql`
    SELECT id::text AS id, item_id::text AS item_id, status::text AS status,
           hold_code, lot_code
    FROM app.inventory_lot_serial
    WHERE id = ANY(${uuidArray(lotIds)})
    ORDER BY id
    FOR UPDATE
  `)) as unknown as Array<{
    id: string;
    item_id: string;
    status: string;
    hold_code: string | null;
    lot_code: string | null;
  }>;

  // 3) Tồn bin + tồn lô (sau khi đã giữ khoá).
  const binRows = (await tx.execute(sql`
    SELECT bin_id::text AS bin_id, lot_serial_id::text AS lot_serial_id,
           qty_on_hand::text AS qty
    FROM app.bin_inventory
    WHERE lot_serial_id = ANY(${uuidArray(lotIds)})
  `)) as unknown as Array<{ bin_id: string; lot_serial_id: string; qty: string }>;

  const stockRows = (await tx.execute(sql`
    SELECT lot_serial_id::text AS lot_serial_id, on_hand::text AS on_hand,
           reserved::text AS reserved
    FROM app.v_lot_stock
    WHERE lot_serial_id = ANY(${uuidArray(lotIds)})
  `)) as unknown as Array<{ lot_serial_id: string; on_hand: string; reserved: string }>;

  const err = evaluateIssuable({
    picks,
    lots: lotRows.map((r) => ({
      id: r.id,
      itemId: r.item_id,
      status: r.status,
      holdCode: r.hold_code,
      lotCode: r.lot_code,
    })),
    binStock: binRows.map((r) => ({
      binId: r.bin_id,
      lotSerialId: r.lot_serial_id,
      qty: Number(r.qty) || 0,
    })),
    lotStock: stockRows.map((r) => ({
      lotSerialId: r.lot_serial_id,
      onHand: Number(r.on_hand) || 0,
      reserved: Number(r.reserved) || 0,
    })),
    allowStatuses: opts.allowStatuses,
    ownReservations: opts.ownReservations,
  });
  if (err) throw err;
}

/**
 * Đánh dấu CONSUMED các lô đã về 0 (theo ledger — app.v_lot_stock). Chỉ đụng
 * lô AVAILABLE/HOLD; lô HOLD về 0 (admin huỷ hàng hỏng) cũng xoá hold_code.
 * Trả số lô vừa chuyển CONSUMED.
 */
export async function markLotsConsumedIfEmpty(
  tx: Tx,
  lotIds: string[],
): Promise<number> {
  const ids = [...new Set(lotIds)];
  if (ids.length === 0) return 0;
  const rows = (await tx.execute(sql`
    UPDATE app.inventory_lot_serial l
       SET status = 'CONSUMED', hold_code = NULL
     WHERE l.id = ANY(${uuidArray(ids)})
       AND l.status IN ('AVAILABLE', 'HOLD')
       AND (SELECT s.on_hand FROM app.v_lot_stock s WHERE s.lot_serial_id = l.id) <= 0.0001
    RETURNING l.id
  `)) as unknown as Array<{ id: string }>;
  return rows.length;
}

/**
 * Ghi các dòng inventory_txn xuất (có from_bin_id) rồi đánh dấu lô hết hàng.
 * Thứ tự "insert txn TRƯỚC → CONSUMED SAU" là BẮT BUỘC (trigger 0059).
 */
export async function postOutboundTxns(
  tx: Tx,
  picks: IssuePick[],
  meta: {
    txType: "OUT_ISSUE" | "ASSEMBLY_CONSUME" | "ADJUST_MINUS";
    refTable: string;
    refId?: string | null;
    postedBy: string | null;
    notes?: string | null;
  },
): Promise<{ txnIds: string[]; consumedLots: number }> {
  const txnIds: string[] = [];
  for (const p of picks) {
    const [txn] = await tx
      .insert(inventoryTxn)
      .values({
        txType: meta.txType,
        itemId: p.itemId,
        qty: String(p.qty),
        fromBinId: p.binId,
        lotSerialId: p.lotSerialId,
        refTable: meta.refTable,
        refId: meta.refId ?? null,
        postedBy: meta.postedBy,
        notes: meta.notes ?? null,
      })
      .returning({ id: inventoryTxn.id });
    if (!txn) throw new Error("INVENTORY_TXN_INSERT_FAILED");
    txnIds.push(txn.id);
  }
  const consumedLots = await markLotsConsumedIfEmpty(
    tx,
    picks.map((p) => p.lotSerialId),
  );
  return { txnIds, consumedLots };
}

/**
 * Chuẩn hoá lỗi DB liên quan xuất kho thành `StockGuardError` (409):
 *  - trigger 0059 `LOT_NOT_ISSUABLE…` → LOT_NOT_AVAILABLE;
 *  - lock_timeout (55P03) → LOCK_BUSY "thử lại".
 * Trả null nếu không phải lỗi thuộc nhóm này (caller xử lý như 500).
 */
export function mapDbGuardError(err: unknown): StockGuardError | null {
  if (err instanceof StockGuardError) return err;
  if (!err || typeof err !== "object") return null;
  const e = err as {
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown; message?: unknown } | null;
  };
  const msg = `${String(e.message ?? "")} ${String(e.cause?.message ?? "")}`;
  const code = String(e.code ?? e.cause?.code ?? "");
  if (msg.includes("LOT_NOT_ISSUABLE")) {
    return new StockGuardError(
      "LOT_NOT_AVAILABLE",
      "Lô hàng không ở trạng thái sẵn dùng (đang chờ QC, bị giữ HOLD hoặc đã hết) — không được xuất.",
    );
  }
  if (code === "55P03" || /lock timeout/i.test(msg)) {
    return new StockGuardError(
      "LOCK_BUSY",
      "Đang có thao tác khác trên cùng mã hàng/lô, vui lòng thử lại sau vài giây.",
    );
  }
  return null;
}
