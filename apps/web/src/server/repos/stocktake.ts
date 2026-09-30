import { sql } from "drizzle-orm";
import {
  inventoryLotSerial,
  inventoryTxn,
  stocktakeLine,
  stocktakeSession,
  stocktakeSessionBin,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { currentYymm, genDocNo } from "./_docNumber";
import {
  assertIssuable,
  mapDbGuardError,
  postOutboundTxns,
  uuidArray,
  type IssuePick,
} from "./stockGuard";

/**
 * V4.3 Việc 2 — Kiểm kê kho (stocktake).
 *
 * State machine: DRAFT (đang đếm) → PENDING_APPROVAL (Kho gửi duyệt) →
 *   APPROVED (admin chốt, ghi ADJUST_PLUS/MINUS 1 lần) | REJECTED (admin trả
 *   lại kèm lý do → quay lại DRAFT để đếm lại). DRAFT → CANCELLED (huỷ, không
 *   ghi gì). Xem chi tiết state machine ở `packages/db/src/schema/stocktake.ts`.
 *
 * Phần THUẦN (không chạm DB) tách riêng để vitest không cần DATABASE_URL —
 * theo đúng mẫu `putawaySuggestion.ts`/`stockGuard.ts`.
 */

function round4(n: number): number {
  return Number(n.toFixed(4));
}

/* ───────────────────────── Phần thuần — tính chênh lệch ───────────────── */

export interface StocktakeLineLike {
  lineId: string;
  bookQty: number;
  countedQty: number | null;
}

/** Chênh lệch 1 dòng = counted - book. Chưa đếm (null) → 0 (không tính là lệch). */
export function computeLineDiff(line: StocktakeLineLike): number {
  if (line.countedQty == null) return 0;
  return round4(line.countedQty - line.bookQty);
}

export interface StocktakeVarianceLine extends StocktakeLineLike {
  diffQty: number;
  /** Đơn giá tham khảo (item_supplier.price_ref ưu tiên NCC chính) — null nếu chưa có. */
  unitPrice?: number | null;
}

export interface StocktakeVarianceSummary {
  totalLines: number;
  countedLines: number;
  uncountedLines: number;
  diffLines: number;
  surplusQty: number;
  shortageQty: number;
  surplusValue: number | null;
  shortageValue: number | null;
}

/** Tổng hợp chênh lệch cho màn duyệt — THUẦN, dùng chung server + hiển thị test. */
export function summarizeStocktakeVariance(
  lines: StocktakeVarianceLine[],
): StocktakeVarianceSummary {
  let countedLines = 0;
  let diffLines = 0;
  let surplusQty = 0;
  let shortageQty = 0;
  let surplusValue = 0;
  let shortageValue = 0;
  let hasAnyPrice = false;
  for (const l of lines) {
    if (l.countedQty != null) countedLines++;
    const diff = computeLineDiff(l);
    if (diff === 0) continue;
    diffLines++;
    const price = l.unitPrice ?? null;
    if (price != null) hasAnyPrice = true;
    if (diff > 0) {
      surplusQty = round4(surplusQty + diff);
      if (price != null) surplusValue += diff * price;
    } else {
      shortageQty = round4(shortageQty + Math.abs(diff));
      if (price != null) shortageValue += Math.abs(diff) * price;
    }
  }
  return {
    totalLines: lines.length,
    countedLines,
    uncountedLines: lines.length - countedLines,
    diffLines,
    surplusQty,
    shortageQty,
    surplusValue: hasAnyPrice ? round4(surplusValue) : null,
    shortageValue: hasAnyPrice ? round4(shortageValue) : null,
  };
}

/** true nếu mọi dòng đã có `countedQty` — điều kiện bắt buộc trước khi gửi duyệt. */
export function isSessionFullyCounted(lines: Array<{ countedQty: number | null }>): boolean {
  return lines.length > 0 && lines.every((l) => l.countedQty != null);
}

/* ───────────────────────── DB — CRUD phiên kiểm kê ─────────────────────── */

export interface CreateStocktakeInput {
  binIds: string[];
  scopeNote?: string | null;
  notes?: string | null;
  createdBy: string;
}

export class StocktakeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StocktakeError";
  }
}

/**
 * Tạo phiên kiểm kê: chụp tồn sổ sách NGAY (từ `app.bin_inventory`) cho các
 * bin trong `binIds` → mỗi (bin, item, lô) đang có tồn > 0 thành 1 dòng đếm.
 */
export async function createStocktakeSession(
  input: CreateStocktakeInput,
): Promise<{ id: string; code: string; lineCount: number }> {
  const binIds = [...new Set(input.binIds)];
  if (binIds.length === 0) {
    throw new StocktakeError("NO_BINS", "Phải chọn ít nhất 1 ô để kiểm kê.");
  }

  return db.transaction(async (tx) => {
    const code = await genDocNo(tx, {
      table: "app.stocktake_session",
      column: "code",
      prefix: `KK-${currentYymm()}`,
      seqPart: 3,
      pad: 4,
    });

    const [session] = await tx
      .insert(stocktakeSession)
      .values({
        code,
        status: "DRAFT",
        scopeNote: input.scopeNote ?? null,
        notes: input.notes ?? null,
        createdBy: input.createdBy,
      })
      .returning({ id: stocktakeSession.id, code: stocktakeSession.code });
    if (!session) throw new Error("STOCKTAKE_SESSION_INSERT_FAILED");

    await tx.insert(stocktakeSessionBin).values(
      binIds.map((binId) => ({ sessionId: session.id, binId })),
    );

    const snapshotRows = (await tx.execute(sql`
      SELECT bi.bin_id::text AS bin_id, bi.item_id::text AS item_id,
             bi.lot_serial_id::text AS lot_serial_id,
             bi.qty_on_hand::text AS qty, ils.lot_code
      FROM app.bin_inventory bi
      LEFT JOIN app.inventory_lot_serial ils ON ils.id = bi.lot_serial_id
      WHERE bi.bin_id = ANY(${uuidArray(binIds)})
      ORDER BY bi.bin_id, bi.item_id
    `)) as unknown as Array<{
      bin_id: string;
      item_id: string;
      lot_serial_id: string | null;
      qty: string;
      lot_code: string | null;
    }>;

    if (snapshotRows.length > 0) {
      await tx.insert(stocktakeLine).values(
        snapshotRows.map((r) => ({
          sessionId: session.id,
          binId: r.bin_id,
          itemId: r.item_id,
          lotSerialId: r.lot_serial_id,
          lotCodeSnapshot: r.lot_code,
          bookQty: r.qty,
        })),
      );
    }

    return { id: session.id, code: session.code, lineCount: snapshotRows.length };
  });
}

export async function getStocktakeSession(id: string) {
  const [row] = await db
    .select()
    .from(stocktakeSession)
    .where(sql`${stocktakeSession.id} = ${id}::uuid`)
    .limit(1);
  return row ?? null;
}

export interface ListStocktakeQuery {
  status?: string[];
  page: number;
  pageSize: number;
}

export async function listStocktakeSessions(q: ListStocktakeQuery) {
  const statusClause =
    q.status && q.status.length > 0
      ? sql`WHERE s.status = ANY(ARRAY[${sql.join(
          q.status.map((s) => sql`${s}::text`),
          sql`, `,
        )}])`
      : sql``;
  const offset = (q.page - 1) * q.pageSize;

  const rows = (await db.execute(sql`
    SELECT s.id::text AS id, s.code, s.status, s.scope_note, s.notes,
           s.snapshot_at::text AS snapshot_at, s.created_at::text AS created_at,
           s.submitted_at::text AS submitted_at, s.approved_at::text AS approved_at,
           s.rejected_at::text AS rejected_at, s.reject_reason,
           creator.full_name AS creator_name,
           s.created_by::text AS created_by,
           (SELECT COUNT(*)::int FROM app.stocktake_line l WHERE l.session_id = s.id) AS line_count,
           (SELECT COUNT(*)::int FROM app.stocktake_line l WHERE l.session_id = s.id AND l.counted_qty IS NOT NULL) AS counted_count,
           (SELECT COUNT(DISTINCT bin_id)::int FROM app.stocktake_session_bin b WHERE b.session_id = s.id) AS bin_count
    FROM app.stocktake_session s
    LEFT JOIN app.user_account creator ON creator.id = s.created_by
    ${statusClause}
    ORDER BY s.created_at DESC
    LIMIT ${q.pageSize} OFFSET ${offset}
  `)) as unknown as Array<Record<string, unknown>>;

  const totalRows = (await db.execute(sql`
    SELECT COUNT(*)::int AS total FROM app.stocktake_session s ${statusClause}
  `)) as unknown as Array<{ total: number }>;

  return { rows, total: totalRows[0]?.total ?? 0 };
}

export interface StocktakeLineRow {
  id: string;
  binId: string;
  binFullCode: string;
  itemId: string;
  sku: string;
  name: string;
  uom: string | null;
  lotSerialId: string | null;
  lotCode: string | null;
  bookQty: number;
  countedQty: number | null;
  countedBy: string | null;
  countedAt: string | null;
  notes: string | null;
  unitPrice: number | null;
}

interface RawStocktakeLineRow {
  id: string;
  bin_id: string;
  bin_full_code: string;
  item_id: string;
  sku: string;
  name: string;
  uom: string | null;
  lot_serial_id: string | null;
  lot_code: string | null;
  book_qty: string;
  counted_qty: string | null;
  counted_by: string | null;
  counted_at: string | null;
  notes: string | null;
  unit_price: string | null;
}

export async function getStocktakeLines(sessionId: string): Promise<StocktakeLineRow[]> {
  const rows = (await db.execute(sql`
    SELECT l.id::text AS id, l.bin_id::text AS bin_id, lb.full_code AS bin_full_code,
           l.item_id::text AS item_id, it.sku, it.name, it.uom,
           l.lot_serial_id::text AS lot_serial_id,
           COALESCE(ils.lot_code, l.lot_code_snapshot) AS lot_code,
           l.book_qty::text AS book_qty, l.counted_qty::text AS counted_qty,
           l.counted_by::text AS counted_by, l.counted_at::text AS counted_at,
           l.notes,
           (
             SELECT MIN(isup.price_ref)::text FROM app.item_supplier isup
             WHERE isup.item_id = l.item_id AND isup.price_ref IS NOT NULL
           ) AS unit_price
    FROM app.stocktake_line l
    JOIN app.location_bin lb ON lb.id = l.bin_id
    JOIN app.item it ON it.id = l.item_id
    LEFT JOIN app.inventory_lot_serial ils ON ils.id = l.lot_serial_id
    WHERE l.session_id = ${sessionId}::uuid
    ORDER BY lb.full_code, it.sku
  `)) as unknown as RawStocktakeLineRow[];

  return rows.map((r) => ({
    id: r.id,
    binId: r.bin_id,
    binFullCode: r.bin_full_code,
    itemId: r.item_id,
    sku: r.sku,
    name: r.name,
    uom: r.uom,
    lotSerialId: r.lot_serial_id,
    lotCode: r.lot_code,
    bookQty: Number(r.book_qty ?? "0"),
    countedQty: r.counted_qty == null ? null : Number(r.counted_qty),
    countedBy: r.counted_by,
    countedAt: r.counted_at,
    notes: r.notes,
    unitPrice: r.unit_price == null ? null : Number(r.unit_price),
  }));
}

/** Giao dịch nhập/xuất trên các bin thuộc phiên PHÁT SINH SAU thời điểm chụp — cảnh báo trong lúc đếm. */
export async function listTxnSinceSnapshot(sessionId: string): Promise<
  Array<{ binFullCode: string; sku: string; txType: string; qty: number; occurredAt: string }>
> {
  const rows = (await db.execute(sql`
    SELECT lb.full_code AS bin_full_code, it.sku, t.tx_type, t.qty::text AS qty,
           t.occurred_at::text AS occurred_at
    FROM app.stocktake_session s
    JOIN app.stocktake_session_bin sb ON sb.session_id = s.id
    JOIN app.location_bin lb ON lb.id = sb.bin_id
    JOIN app.inventory_txn t ON (t.from_bin_id = sb.bin_id OR t.to_bin_id = sb.bin_id)
    JOIN app.item it ON it.id = t.item_id
    WHERE s.id = ${sessionId}::uuid AND t.occurred_at > s.snapshot_at
    ORDER BY t.occurred_at DESC
    LIMIT 200
  `)) as unknown as Array<{
    bin_full_code: string;
    sku: string;
    tx_type: string;
    qty: string;
    occurred_at: string;
  }>;
  return rows.map((r) => ({
    binFullCode: r.bin_full_code,
    sku: r.sku,
    txType: r.tx_type,
    qty: Number(r.qty),
    occurredAt: r.occurred_at,
  }));
}

export interface SaveCountInput {
  lineId: string;
  countedQty: number | null;
  notes?: string | null;
}

/** Ghi số đếm hàng loạt (lưu nháp liên tục) — CHỈ khi phiên đang DRAFT. */
export async function saveStocktakeCounts(
  sessionId: string,
  counts: SaveCountInput[],
  countedBy: string,
): Promise<number> {
  if (counts.length === 0) return 0;
  const session = await getStocktakeSession(sessionId);
  if (!session) throw new StocktakeError("NOT_FOUND", "Không tìm thấy phiên kiểm kê.");
  if (session.status !== "DRAFT") {
    throw new StocktakeError(
      "INVALID_STATE",
      `Phiên đang ở trạng thái ${session.status} — chỉ nhập số đếm khi đang DRAFT.`,
    );
  }
  let updated = 0;
  await db.transaction(async (tx) => {
    for (const c of counts) {
      const res = await tx
        .update(stocktakeLine)
        .set({
          countedQty: c.countedQty == null ? null : String(c.countedQty),
          countedBy: c.countedQty == null ? null : countedBy,
          countedAt: c.countedQty == null ? null : new Date(),
          notes: c.notes ?? null,
        })
        .where(
          sql`${stocktakeLine.id} = ${c.lineId}::uuid AND ${stocktakeLine.sessionId} = ${sessionId}::uuid`,
        )
        .returning({ id: stocktakeLine.id });
      updated += res.length;
    }
  });
  return updated;
}

/** DRAFT → PENDING_APPROVAL. Bắt buộc mọi dòng đã đếm. */
export async function submitStocktakeSession(
  id: string,
  submittedBy: string,
): Promise<{ id: string; code: string }> {
  const session = await getStocktakeSession(id);
  if (!session) throw new StocktakeError("NOT_FOUND", "Không tìm thấy phiên kiểm kê.");
  if (session.status !== "DRAFT") {
    throw new StocktakeError(
      "INVALID_STATE",
      `Phiên đang ở trạng thái ${session.status} — chỉ gửi duyệt khi đang DRAFT.`,
    );
  }
  const lines = await getStocktakeLines(id);
  if (!isSessionFullyCounted(lines)) {
    throw new StocktakeError(
      "NOT_FULLY_COUNTED",
      `Còn ${lines.filter((l) => l.countedQty == null).length} dòng chưa đếm — đếm hết trước khi gửi duyệt.`,
    );
  }
  const [row] = await db
    .update(stocktakeSession)
    .set({ status: "PENDING_APPROVAL", submittedBy, submittedAt: new Date(), updatedAt: new Date() })
    .where(sql`${stocktakeSession.id} = ${id}::uuid AND ${stocktakeSession.status} = 'DRAFT'`)
    .returning({ id: stocktakeSession.id, code: stocktakeSession.code });
  if (!row) throw new StocktakeError("CONFLICT", "Phiên đã đổi trạng thái, tải lại trang.");
  return row;
}

/** REJECTED → DRAFT (mở lại để đếm lại sau khi Giám đốc trả lại). */
export async function reopenStocktakeSession(id: string): Promise<{ id: string } | null> {
  const [row] = await db
    .update(stocktakeSession)
    .set({ status: "DRAFT", submittedBy: null, submittedAt: null, updatedAt: new Date() })
    .where(sql`${stocktakeSession.id} = ${id}::uuid AND ${stocktakeSession.status} = 'REJECTED'`)
    .returning({ id: stocktakeSession.id });
  return row ?? null;
}

/** DRAFT → CANCELLED. Không ghi điều chỉnh gì. */
export async function cancelStocktakeSession(id: string): Promise<{ id: string } | null> {
  const [row] = await db
    .update(stocktakeSession)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(sql`${stocktakeSession.id} = ${id}::uuid AND ${stocktakeSession.status} = 'DRAFT'`)
    .returning({ id: stocktakeSession.id });
  return row ?? null;
}

/** PENDING_APPROVAL → REJECTED, kèm lý do — CHỈ admin (kiểm ở route). */
export async function rejectStocktakeSession(
  id: string,
  rejectedBy: string,
  reason: string,
): Promise<{ id: string; code: string; createdBy: string } | null> {
  const [row] = await db
    .update(stocktakeSession)
    .set({
      status: "REJECTED",
      rejectedBy,
      rejectedAt: new Date(),
      rejectReason: reason,
      updatedAt: new Date(),
    })
    .where(sql`${stocktakeSession.id} = ${id}::uuid AND ${stocktakeSession.status} = 'PENDING_APPROVAL'`)
    .returning({ id: stocktakeSession.id, code: stocktakeSession.code, createdBy: stocktakeSession.createdBy });
  return row ?? null;
}

export interface ApproveResult {
  id: string;
  code: string;
  createdBy: string;
  diffLineCount: number;
}

/**
 * PENDING_APPROVAL → APPROVED. Ghi TẤT CẢ điều chỉnh (ADJUST_PLUS/MINUS)
 * trong 1 transaction DUY NHẤT — khoá theo item như `assertIssuable` (KHO-05).
 * CHỈ admin (kiểm role ở route, giống `deliveryNotes.ts`/`confirmDeliveryNote`).
 */
export async function approveStocktakeSession(
  id: string,
  approvedBy: string,
): Promise<ApproveResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    const [session] = (await tx.execute(sql`
      SELECT id::text AS id, code, status, created_by::text AS created_by
      FROM app.stocktake_session WHERE id = ${id}::uuid FOR UPDATE
    `)) as unknown as Array<{ id: string; code: string; status: string; created_by: string }>;
    if (!session) throw new StocktakeError("NOT_FOUND", "Không tìm thấy phiên kiểm kê.");
    if (session.status !== "PENDING_APPROVAL") {
      throw new StocktakeError(
        "INVALID_STATE",
        `Phiên đang ở trạng thái ${session.status} — chỉ duyệt khi PENDING_APPROVAL.`,
      );
    }

    const lineRows = (await tx.execute(sql`
      SELECT l.id::text AS id, l.bin_id::text AS bin_id, l.item_id::text AS item_id,
             l.lot_serial_id::text AS lot_serial_id, l.book_qty::text AS book_qty,
             l.counted_qty::text AS counted_qty
      FROM app.stocktake_line l
      WHERE l.session_id = ${id}::uuid
      ORDER BY l.id
    `)) as unknown as Array<{
      id: string;
      bin_id: string;
      item_id: string;
      lot_serial_id: string | null;
      book_qty: string;
      counted_qty: string | null;
    }>;

    const diffLines = lineRows
      .map((r) => ({
        lineId: r.id,
        binId: r.bin_id,
        itemId: r.item_id,
        lotSerialId: r.lot_serial_id,
        diff: computeLineDiff({
          lineId: r.id,
          bookQty: Number(r.book_qty),
          countedQty: r.counted_qty == null ? null : Number(r.counted_qty),
        }),
      }))
      .filter((r) => r.diff !== 0);

    // MINUS — batch qua guard chung (khoá item + lô, không vượt tồn thật).
    const minusLines = diffLines.filter((r) => r.diff < 0);
    if (minusLines.some((r) => !r.lotSerialId)) {
      throw new StocktakeError(
        "MISSING_LOT",
        "Có dòng thiếu bị hụt nhưng không rõ lô — không thể ghi điều chỉnh giảm.",
      );
    }
    if (minusLines.length > 0) {
      const picks: IssuePick[] = minusLines.map((r) => ({
        itemId: r.itemId,
        lotSerialId: r.lotSerialId!,
        binId: r.binId,
        qty: Math.abs(r.diff),
      }));
      await assertIssuable(tx, picks, { allowStatuses: ["AVAILABLE", "HOLD"] });
      const posted = await postOutboundTxns(tx, picks, {
        txType: "ADJUST_MINUS",
        refTable: "stocktake_session",
        refId: id,
        postedBy: approvedBy,
        notes: `Kiểm kê ${session.code} — điều chỉnh giảm theo số đếm thực tế`,
      });
      for (let i = 0; i < minusLines.length; i++) {
        const txnId = posted.txnIds[i];
        if (txnId) {
          await tx
            .update(stocktakeLine)
            .set({ adjustTxnId: txnId })
            .where(sql`${stocktakeLine.id} = ${minusLines[i]!.lineId}::uuid`);
        }
      }
    }

    // PLUS — từng dòng (lô đã biết, chỉ cần mở lại nếu CONSUMED).
    const plusLines = diffLines.filter((r) => r.diff > 0);
    for (const r of plusLines) {
      let lotSerialId = r.lotSerialId;
      if (lotSerialId) {
        const [lot] = (await tx.execute(sql`
          SELECT status FROM app.inventory_lot_serial WHERE id = ${lotSerialId}::uuid FOR UPDATE
        `)) as unknown as Array<{ status: string }>;
        if (lot?.status === "EXPIRED") {
          throw new StocktakeError(
            "LOT_EXPIRED",
            `Lô của 1 dòng thừa đã hết hạn — không cộng thêm, hãy tạo lô mới thủ công tại Sơ đồ kho.`,
          );
        }
        if (lot?.status === "CONSUMED") {
          await tx
            .update(inventoryLotSerial)
            .set({ status: "AVAILABLE" })
            .where(sql`${inventoryLotSerial.id} = ${lotSerialId}::uuid`);
        }
      } else {
        const [newLot] = await tx
          .insert(inventoryLotSerial)
          .values({
            itemId: r.itemId,
            status: "AVAILABLE",
            supplierRef: `KK-${Date.now().toString(36).toUpperCase()}`,
            notes: `Lô mới từ kiểm kê ${session.code} (hàng thừa không rõ lô)`,
          })
          .returning({ id: inventoryLotSerial.id });
        lotSerialId = newLot!.id;
      }
      const [txn] = await tx
        .insert(inventoryTxn)
        .values({
          txType: "ADJUST_PLUS",
          itemId: r.itemId,
          qty: String(r.diff),
          toBinId: r.binId,
          lotSerialId,
          refTable: "stocktake_session",
          refId: id,
          postedBy: approvedBy,
          notes: `Kiểm kê ${session.code} — điều chỉnh tăng theo số đếm thực tế`,
        })
        .returning({ id: inventoryTxn.id });
      await tx
        .update(stocktakeLine)
        .set({ adjustTxnId: txn!.id })
        .where(sql`${stocktakeLine.id} = ${r.lineId}::uuid`);
    }

    await tx
      .update(stocktakeSession)
      .set({ status: "APPROVED", approvedBy, approvedAt: new Date(), updatedAt: new Date() })
      .where(sql`${stocktakeSession.id} = ${id}::uuid`);

    return {
      id: session.id,
      code: session.code,
      createdBy: session.created_by,
      diffLineCount: diffLines.length,
    };
  }).catch((err) => {
    const g = mapDbGuardError(err);
    if (g) throw new StocktakeError(g.code, g.message);
    throw err;
  });
}

/** Danh sách bin hiện có, kèm khu/kệ — dùng cho UI chọn phạm vi kiểm kê. */
export async function listBinsForScope(): Promise<
  Array<{ id: string; fullCode: string; area: string | null; rack: string | null; hasStock: boolean }>
> {
  const rows = (await db.execute(sql`
    SELECT lb.id::text AS id, lb.full_code, lb.area, lb.rack,
           EXISTS(SELECT 1 FROM app.bin_inventory bi WHERE bi.bin_id = lb.id) AS has_stock
    FROM app.location_bin lb
    WHERE lb.is_active = TRUE
    ORDER BY lb.area, lb.rack, lb.level_no, lb.position
  `)) as unknown as Array<{
    id: string;
    full_code: string;
    area: string | null;
    rack: string | null;
    has_stock: boolean;
  }>;
  return rows.map((r) => ({
    id: r.id,
    fullCode: r.full_code,
    area: r.area,
    rack: r.rack,
    hasStock: r.has_stock,
  }));
}
