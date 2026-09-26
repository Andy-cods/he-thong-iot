/**
 * V4.1 Đợt 1b (Q3/KHO-04) — Phiếu xuất kho `PX-YYMM-NNNN`.
 *
 * MỌI đường xuất kho đi qua `createGoodsIssueTx` để có chứng từ + thống kê một
 * nguồn:
 *   - giao phiếu yêu cầu vật tư (`issueMaterialRequest`, giao từng phần được);
 *   - xuất nhanh ở tab Kho (`QUICK_ISSUE`);
 *   - duyệt yêu cầu xuất kho ISR (`ISSUE_REQUEST`, unique 1 phiếu / ISR).
 *
 * Thứ tự trong transaction (bắt buộc):
 *   1. `assertIssuable` — khoá item → lô cố định + kiểm lô AVAILABLE, tồn bin,
 *      phần giữ chỗ (stockGuard, Đợt 1a).
 *   2. `genDocNo` PX-YYMM-NNNN (advisory lock theo tháng).
 *   3. INSERT header `goods_issue`.
 *   4. `postOutboundTxns` OUT_ISSUE `ref_table='goods_issue'`, `ref_id`=phiếu
 *      (insert txn TRƯỚC → đánh dấu lô CONSUMED SAU — trigger 0059).
 *   5. INSERT `goods_issue_line` — mỗi dòng ↔ đúng 1 inventory_txn.
 *
 * Giao phiếu yêu cầu: KHOÁ phiếu (`FOR UPDATE`) trước → 2 người giao cùng lúc
 * xếp hàng; không giao vượt SL còn lại; cộng `delivered_qty`; trạng thái
 * PARTIAL / DELIVERED tính lại từ SL (không đổi tay sang DELIVERED nữa).
 */
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  goodsIssue,
  goodsIssueLine,
  inventoryLotSerial,
  item,
  locationBin,
  materialRequest,
  materialRequestLine,
  userAccount,
  warehouseIssueRequest,
  workOrder,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { currentYymm, genDocNo } from "./_docNumber";
import {
  assertIssuable,
  postOutboundTxns,
  type IssuePick,
  type Tx,
} from "./stockGuard";

export type GoodsIssueSource = "MATERIAL_REQUEST" | "QUICK_ISSUE" | "ISSUE_REQUEST";
export type GoodsIssueReason =
  | "production"
  | "sales"
  | "manual"
  | "loss"
  | "return"
  | "other";

export const GOODS_ISSUE_SOURCES: GoodsIssueSource[] = [
  "MATERIAL_REQUEST",
  "QUICK_ISSUE",
  "ISSUE_REQUEST",
];

/** Trạng thái phiếu yêu cầu còn giao được. */
export const MR_ISSUABLE_STATUSES = ["PENDING", "PICKING", "READY", "PARTIAL"] as const;

const EPS = 1e-6;

/** Lỗi nghiệp vụ phiếu xuất (không phải lỗi tồn — lỗi tồn là StockGuardError). */
export class GoodsIssueError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "GoodsIssueError";
  }
}

export interface GoodsIssuePickInput extends IssuePick {
  materialRequestLineId?: string | null;
  notes?: string | null;
}

export interface CreateGoodsIssueInput {
  sourceType: GoodsIssueSource;
  reason: GoodsIssueReason;
  materialRequestId?: string | null;
  issueRequestId?: string | null;
  woId?: string | null;
  reference?: string | null;
  notes?: string | null;
  issuedBy: string;
  receivedBy?: string | null;
  picks: GoodsIssuePickInput[];
}

export interface CreatedGoodsIssue {
  id: string;
  issueNo: string;
  totalQty: number;
  lineCount: number;
  txnIds: string[];
  consumedLots: number;
}

/** Làm tròn 4 chữ số (khớp numeric(18,4)) — tránh 0.1+0.2 lệch. */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Tạo phiếu xuất TRONG transaction có sẵn (ISR approve cần claim ISR cùng tx).
 * Throw `StockGuardError` (tồn/lô) hoặc `GoodsIssueError`.
 */
export async function createGoodsIssueTx(
  tx: Tx,
  input: CreateGoodsIssueInput,
): Promise<CreatedGoodsIssue> {
  if (input.picks.length === 0) {
    throw new GoodsIssueError("EMPTY_ISSUE", "Phiếu xuất phải có ít nhất 1 dòng.", 400);
  }

  // 1) Guard chung Đợt 1a (khoá + trạng thái lô + tồn bin + giữ chỗ).
  const picks: IssuePick[] = input.picks.map((p) => ({
    itemId: p.itemId,
    lotSerialId: p.lotSerialId,
    binId: p.binId,
    qty: p.qty,
  }));
  await assertIssuable(tx, picks);

  // 2) Số phiếu race-safe.
  const issueNo = await genDocNo(tx, {
    table: "app.goods_issue",
    column: "issue_no",
    prefix: `PX-${currentYymm()}`,
    seqPart: 3,
  });

  const totalQty = round4(picks.reduce((s, p) => s + p.qty, 0));

  // 3) Header.
  const [header] = await tx
    .insert(goodsIssue)
    .values({
      issueNo,
      sourceType: input.sourceType,
      reason: input.reason,
      materialRequestId: input.materialRequestId ?? null,
      issueRequestId: input.issueRequestId ?? null,
      woId: input.woId ?? null,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      totalQty: String(totalQty),
      issuedBy: input.issuedBy,
      receivedBy: input.receivedBy ?? null,
    })
    .returning({ id: goodsIssue.id });
  if (!header) throw new Error("GOODS_ISSUE_INSERT_FAILED");

  // 4) Ledger — insert txn TRƯỚC, CONSUMED SAU (trigger 0059).
  const posted = await postOutboundTxns(tx, picks, {
    txType: "OUT_ISSUE",
    refTable: "goods_issue",
    refId: header.id,
    postedBy: input.issuedBy,
    notes: [issueNo, input.reference, input.notes].filter(Boolean).join(" · ") || null,
  });

  // 5) Dòng phiếu ↔ txn (cùng thứ tự picks).
  await tx.insert(goodsIssueLine).values(
    input.picks.map((p, i) => ({
      goodsIssueId: header.id,
      lineNo: i + 1,
      itemId: p.itemId,
      lotSerialId: p.lotSerialId,
      binId: p.binId,
      qty: String(p.qty),
      inventoryTxnId: posted.txnIds[i]!,
      materialRequestLineId: p.materialRequestLineId ?? null,
      notes: p.notes ?? null,
    })),
  );

  return {
    id: header.id,
    issueNo,
    totalQty,
    lineCount: input.picks.length,
    txnIds: posted.txnIds,
    consumedLots: posted.consumedLots,
  };
}

/** Tạo phiếu xuất trong transaction riêng (xuất nhanh). */
export async function createGoodsIssue(
  input: CreateGoodsIssueInput,
): Promise<CreatedGoodsIssue> {
  return db.transaction((tx) => createGoodsIssueTx(tx, input));
}

/* ───────────────────────── Giao phiếu yêu cầu vật tư ───────────────────────── */

export interface MrLineState {
  id: string;
  lineNo?: number;
  itemId: string;
  itemSku?: string | null;
  requestedQty: number;
  deliveredQty: number;
}

export interface MrIssueRequestLine {
  materialRequestLineId: string;
  picks: Array<{ lotSerialId: string; binId: string; qty: number }>;
}

export type ValidateMrIssueResult =
  | {
      ok: true;
      picks: GoodsIssuePickInput[];
      /** SL giao lần này theo từng dòng phiếu yêu cầu. */
      issuedByLine: Map<string, number>;
    }
  | { ok: false; error: GoodsIssueError };

/**
 * THUẦN — kiểm lượt giao cho phiếu yêu cầu:
 *  - dòng phải thuộc đúng phiếu; item lấy TỪ DÒNG PHIẾU (không tin client);
 *  - SL mỗi pick > 0; tổng giao mỗi dòng ≤ SL còn lại (yêu cầu − đã giao).
 */
export function validateMrIssue(
  mrLines: MrLineState[],
  request: MrIssueRequestLine[],
): ValidateMrIssueResult {
  const fail = (code: string, msg: string, status = 409): ValidateMrIssueResult => ({
    ok: false,
    error: new GoodsIssueError(code, msg, status),
  });

  const byId = new Map(mrLines.map((l) => [l.id, l]));
  const issuedByLine = new Map<string, number>();
  const picks: GoodsIssuePickInput[] = [];

  for (const rl of request) {
    const line = byId.get(rl.materialRequestLineId);
    if (!line) {
      return fail(
        "LINE_NOT_IN_REQUEST",
        "Có dòng không thuộc phiếu yêu cầu này — vui lòng tải lại trang.",
        400,
      );
    }
    for (const p of rl.picks) {
      if (!Number.isFinite(p.qty) || p.qty <= 0) {
        return fail("INVALID_QTY", "Số lượng xuất phải lớn hơn 0.", 400);
      }
      issuedByLine.set(line.id, (issuedByLine.get(line.id) ?? 0) + p.qty);
      picks.push({
        itemId: line.itemId,
        lotSerialId: p.lotSerialId,
        binId: p.binId,
        qty: p.qty,
        materialRequestLineId: line.id,
      });
    }
  }

  if (picks.length === 0) {
    return fail("EMPTY_ISSUE", "Chưa chọn dòng nào để xuất.", 400);
  }

  for (const [lineId, qty] of issuedByLine) {
    const line = byId.get(lineId)!;
    const remaining = Math.max(0, line.requestedQty - line.deliveredQty);
    if (qty > remaining + EPS) {
      const label = line.itemSku ?? (line.lineNo ? `dòng ${line.lineNo}` : "dòng");
      return fail(
        "OVER_ISSUE",
        remaining <= EPS
          ? `${label} đã giao đủ — không xuất thêm.`
          : `${label} chỉ còn ${Number(remaining.toFixed(4)).toLocaleString("vi-VN")} chưa giao, không xuất ${Number(qty.toFixed(4)).toLocaleString("vi-VN")}.`,
      );
    }
  }

  return { ok: true, picks, issuedByLine };
}

/**
 * THUẦN — trạng thái phiếu yêu cầu sau khi giao: mọi dòng đã giao đủ →
 * DELIVERED, ngược lại PARTIAL.
 */
export function computeMrStatusAfterIssue(
  lines: Array<{ requestedQty: number; deliveredQty: number }>,
): "DELIVERED" | "PARTIAL" {
  if (lines.length === 0) return "PARTIAL";
  return lines.every((l) => l.deliveredQty >= l.requestedQty - EPS)
    ? "DELIVERED"
    : "PARTIAL";
}

export interface IssueMaterialRequestInput {
  materialRequestId: string;
  actorUserId: string;
  lines: MrIssueRequestLine[];
  notes?: string | null;
}

export interface IssueMaterialRequestResult {
  goodsIssue: CreatedGoodsIssue;
  requestNo: string;
  requestedBy: string;
  previousStatus: string;
  status: "DELIVERED" | "PARTIAL";
}

/**
 * Lập phiếu xuất cho phiếu yêu cầu vật tư (giao từng phần được).
 * Throw GoodsIssueError / StockGuardError.
 */
export async function issueMaterialRequest(
  input: IssueMaterialRequestInput,
): Promise<IssueMaterialRequestResult> {
  return db.transaction(async (tx) => {
    // 1) Khoá phiếu yêu cầu — 2 lượt giao đồng thời xếp hàng tại đây.
    const [mr] = await tx
      .select()
      .from(materialRequest)
      .where(eq(materialRequest.id, input.materialRequestId))
      .for("update")
      .limit(1);
    if (!mr) {
      throw new GoodsIssueError("NOT_FOUND", "Phiếu yêu cầu không tồn tại.", 404);
    }
    if (!(MR_ISSUABLE_STATUSES as readonly string[]).includes(mr.status)) {
      throw new GoodsIssueError(
        "MR_NOT_ISSUABLE",
        mr.status === "DELIVERED"
          ? `${mr.requestNo} đã giao đủ.`
          : `${mr.requestNo} đang ở trạng thái ${mr.status}, không lập phiếu xuất được.`,
      );
    }

    // 2) Dòng phiếu (đọc SAU khi giữ khoá phiếu → delivered_qty nhất quán).
    const lineRows = await tx
      .select({
        id: materialRequestLine.id,
        lineNo: materialRequestLine.lineNo,
        itemId: materialRequestLine.itemId,
        requestedQty: materialRequestLine.requestedQty,
        pickedQty: materialRequestLine.pickedQty,
        deliveredQty: materialRequestLine.deliveredQty,
      })
      .from(materialRequestLine)
      .where(eq(materialRequestLine.requestId, mr.id));

    const state: MrLineState[] = lineRows.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      itemId: l.itemId,
      requestedQty: Number(l.requestedQty) || 0,
      deliveredQty: Number(l.deliveredQty) || 0,
    }));

    const v = validateMrIssue(state, input.lines);
    if (!v.ok) throw v.error;

    // 3) Phiếu xuất + trừ tồn.
    const gi = await createGoodsIssueTx(tx, {
      sourceType: "MATERIAL_REQUEST",
      reason: "production",
      materialRequestId: mr.id,
      woId: mr.woId ?? null,
      reference: mr.requestNo,
      notes: input.notes ?? null,
      issuedBy: input.actorUserId,
      receivedBy: mr.requestedBy,
      picks: v.picks,
    });

    // 4) Cộng SL đã giao (phiếu đang bị khoá → tính ở JS an toàn).
    const after = lineRows.map((l) => {
      const add = v.issuedByLine.get(l.id) ?? 0;
      const delivered = round4((Number(l.deliveredQty) || 0) + add);
      return {
        id: l.id,
        add,
        requestedQty: Number(l.requestedQty) || 0,
        deliveredQty: delivered,
        pickedQty: Math.max(Number(l.pickedQty) || 0, delivered),
      };
    });
    for (const l of after) {
      if (l.add <= 0) continue;
      await tx
        .update(materialRequestLine)
        .set({
          deliveredQty: String(l.deliveredQty),
          pickedQty: String(l.pickedQty),
        })
        .where(eq(materialRequestLine.id, l.id));
    }

    // 5) Trạng thái phiếu tính từ SL. pickedBy/pickedAt giữ người soạn đầu
    //    tiên (KHO-35: không ghi đè).
    const status = computeMrStatusAfterIssue(after);
    const now = new Date();
    const patch: Record<string, unknown> = { status, updatedAt: now };
    if (!mr.pickedBy) patch.pickedBy = input.actorUserId;
    if (!mr.pickedAt) patch.pickedAt = now;
    if (status === "DELIVERED") {
      patch.deliveredAt = now;
      patch.deliveredTo = mr.requestedBy;
    }
    await tx
      .update(materialRequest)
      .set(patch)
      .where(eq(materialRequest.id, mr.id));

    return {
      goodsIssue: gi,
      requestNo: mr.requestNo,
      requestedBy: mr.requestedBy,
      previousStatus: mr.status,
      status,
    };
  });
}

/* ───────────────────────────── Đọc danh sách / chi tiết ───────────────────────────── */

export interface ListGoodsIssuesQuery {
  sourceType?: GoodsIssueSource;
  /** `YYYY-MM-DD`, giờ Asia/Ho_Chi_Minh, cả 2 đầu. */
  from?: string;
  to?: string;
  q?: string;
  materialRequestId?: string;
  page: number;
  pageSize: number;
}

export async function listGoodsIssues(q: ListGoodsIssuesQuery) {
  const where: SQL[] = [];
  if (q.sourceType) where.push(eq(goodsIssue.sourceType, q.sourceType));
  if (q.materialRequestId) {
    where.push(eq(goodsIssue.materialRequestId, q.materialRequestId));
  }
  if (q.from) {
    where.push(
      sql`(${goodsIssue.issuedAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ${q.from}::date`,
    );
  }
  if (q.to) {
    where.push(
      sql`(${goodsIssue.issuedAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= ${q.to}::date`,
    );
  }
  if (q.q && q.q.trim()) {
    const needle = `%${q.q.trim()}%`;
    where.push(
      sql`(${goodsIssue.issueNo} ILIKE ${needle} OR ${goodsIssue.reference} ILIKE ${needle})`,
    );
  }
  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const offset = (q.page - 1) * q.pageSize;

  const [totalRow, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(goodsIssue)
      .where(whereExpr),
    db
      .select({
        id: goodsIssue.id,
        issueNo: goodsIssue.issueNo,
        sourceType: goodsIssue.sourceType,
        reason: goodsIssue.reason,
        reference: goodsIssue.reference,
        notes: goodsIssue.notes,
        totalQty: goodsIssue.totalQty,
        issuedAt: goodsIssue.issuedAt,
        issuedBy: goodsIssue.issuedBy,
        issuedByName: sql<string | null>`COALESCE(${userAccount.fullName}, ${userAccount.username})`,
        materialRequestId: goodsIssue.materialRequestId,
        materialRequestNo: materialRequest.requestNo,
        issueRequestId: goodsIssue.issueRequestId,
        issueRequestNo: warehouseIssueRequest.requestNo,
        woId: goodsIssue.woId,
        woNo: workOrder.woNo,
        lineCount: sql<number>`(SELECT count(*)::int FROM app.goods_issue_line gl WHERE gl.goods_issue_id = ${goodsIssue.id})`,
      })
      .from(goodsIssue)
      .leftJoin(userAccount, eq(userAccount.id, goodsIssue.issuedBy))
      .leftJoin(materialRequest, eq(materialRequest.id, goodsIssue.materialRequestId))
      .leftJoin(
        warehouseIssueRequest,
        eq(warehouseIssueRequest.id, goodsIssue.issueRequestId),
      )
      .leftJoin(workOrder, eq(workOrder.id, goodsIssue.woId))
      .where(whereExpr)
      .orderBy(desc(goodsIssue.issuedAt))
      .limit(q.pageSize)
      .offset(offset),
  ]);

  return { rows, total: totalRow[0]?.count ?? 0 };
}

export interface GoodsIssueLineView {
  id: string;
  goodsIssueId: string;
  lineNo: number;
  itemId: string;
  sku: string | null;
  itemName: string | null;
  uom: string | null;
  lotSerialId: string;
  lotCode: string | null;
  binId: string;
  binCode: string | null;
  qty: string;
  materialRequestLineId: string | null;
  notes: string | null;
}

/** Dòng của nhiều phiếu xuất 1 lượt (tránh N+1). */
export async function listGoodsIssueLines(
  goodsIssueIds: string[],
): Promise<GoodsIssueLineView[]> {
  if (goodsIssueIds.length === 0) return [];
  return db
    .select({
      id: goodsIssueLine.id,
      goodsIssueId: goodsIssueLine.goodsIssueId,
      lineNo: goodsIssueLine.lineNo,
      itemId: goodsIssueLine.itemId,
      sku: item.sku,
      itemName: item.name,
      uom: item.uom,
      lotSerialId: goodsIssueLine.lotSerialId,
      lotCode: inventoryLotSerial.lotCode,
      binId: goodsIssueLine.binId,
      binCode: locationBin.fullCode,
      qty: goodsIssueLine.qty,
      materialRequestLineId: goodsIssueLine.materialRequestLineId,
      notes: goodsIssueLine.notes,
    })
    .from(goodsIssueLine)
    .leftJoin(item, eq(item.id, goodsIssueLine.itemId))
    .leftJoin(inventoryLotSerial, eq(inventoryLotSerial.id, goodsIssueLine.lotSerialId))
    .leftJoin(locationBin, eq(locationBin.id, goodsIssueLine.binId))
    .where(inArray(goodsIssueLine.goodsIssueId, goodsIssueIds))
    .orderBy(goodsIssueLine.goodsIssueId, goodsIssueLine.lineNo);
}

export async function getGoodsIssue(id: string) {
  const { rows } = await listGoodsIssuesByIds([id]);
  const header = rows[0];
  if (!header) return null;
  const lines = await listGoodsIssueLines([id]);
  return { ...header, lines };
}

async function listGoodsIssuesByIds(ids: string[]) {
  const rows = await db
    .select({
      id: goodsIssue.id,
      issueNo: goodsIssue.issueNo,
      sourceType: goodsIssue.sourceType,
      reason: goodsIssue.reason,
      reference: goodsIssue.reference,
      notes: goodsIssue.notes,
      totalQty: goodsIssue.totalQty,
      issuedAt: goodsIssue.issuedAt,
      issuedBy: goodsIssue.issuedBy,
      issuedByName: sql<string | null>`COALESCE(${userAccount.fullName}, ${userAccount.username})`,
      materialRequestId: goodsIssue.materialRequestId,
      materialRequestNo: materialRequest.requestNo,
      issueRequestId: goodsIssue.issueRequestId,
      issueRequestNo: warehouseIssueRequest.requestNo,
      woId: goodsIssue.woId,
      woNo: workOrder.woNo,
    })
    .from(goodsIssue)
    .leftJoin(userAccount, eq(userAccount.id, goodsIssue.issuedBy))
    .leftJoin(materialRequest, eq(materialRequest.id, goodsIssue.materialRequestId))
    .leftJoin(
      warehouseIssueRequest,
      eq(warehouseIssueRequest.id, goodsIssue.issueRequestId),
    )
    .leftJoin(workOrder, eq(workOrder.id, goodsIssue.woId))
    .where(inArray(goodsIssue.id, ids));
  return { rows };
}

/** Phiếu xuất của 1 phiếu yêu cầu vật tư (kèm dòng) — cho trang chi tiết MR. */
export async function listGoodsIssuesForMaterialRequest(materialRequestId: string) {
  const headers = await db
    .select({
      id: goodsIssue.id,
      issueNo: goodsIssue.issueNo,
      totalQty: goodsIssue.totalQty,
      notes: goodsIssue.notes,
      issuedAt: goodsIssue.issuedAt,
      issuedByName: sql<string | null>`COALESCE(${userAccount.fullName}, ${userAccount.username})`,
    })
    .from(goodsIssue)
    .leftJoin(userAccount, eq(userAccount.id, goodsIssue.issuedBy))
    .where(eq(goodsIssue.materialRequestId, materialRequestId))
    .orderBy(goodsIssue.issuedAt);
  const lines = await listGoodsIssueLines(headers.map((h) => h.id));
  return headers.map((h) => ({
    ...h,
    lines: lines.filter((l) => l.goodsIssueId === h.id),
  }));
}
