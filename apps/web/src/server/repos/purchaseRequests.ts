import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  bomSnapshotLine,
  goodsIssue,
  goodsIssueLine,
  item,
  purchaseOrder,
  purchaseRequest,
  purchaseRequestLine,
  salesOrder,
  userAccount,
} from "@iot/db/schema";
import type {
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseRequestStatus,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import {
  allocateStockAcrossLines,
  buildIssueContext,
  computeCommittedByItem,
  effectiveApprovedQty,
  isRejectStepCurrent,
  isStockRecheckableState,
  netIssuableByItem,
  planStockRecheck,
  resolveBuyDecisions,
  issueCapForStage,
  isWarehouseIssueStage,
  prHasGoodsIssueMessage,
  summarizeBuyDecisions,
  validateStockCommitment,
  vnToday,
  type PrPoSummary,
} from "../../lib/procurement-policy";
import { recreateQuantities, rejectOutcome } from "../../lib/pr-close-policy";
import { deriveDisplayLabel } from "@/lib/pr-display-label";
import { currentYymm, genDocNoBatch } from "./_docNumber";
import { uuidArray } from "./stockGuard";
import {
  createGoodsIssueTx,
  GoodsIssueError,
  type CreatedGoodsIssue,
} from "./goodsIssues";

/**
 * Repository purchase_request — V1.2.
 *
 * Source type: MANUAL (user tự tạo) | SHORTAGE (auto prefill từ shortage board).
 * Status flow: DRAFT → SUBMITTED → APPROVED → CONVERTED (to PO) | REJECTED.
 */

export interface ListPRsQuery {
  status?: PurchaseRequestStatus[];
  /** A14 — true: chỉ phiếu Hoàn tất (completed_at IS NOT NULL); false: loại phiếu Hoàn tất. */
  completed?: boolean;
  linkedOrderId?: string;
  /** V1.8 — filter PR theo BOM (JOIN qua sales_order.bom_template_id). */
  bomTemplateId?: string;
  requestedBy?: string;
  /** V3.13 — lọc phiếu theo đúng 1 ngày (`YYYY-MM-DD`, giờ Asia/Ho_Chi_Minh). */
  date?: string;
  /** V3.16 — lọc khoảng ngày [from, to] (`YYYY-MM-DD`, giờ Asia/Ho_Chi_Minh). Có thể chỉ truyền 1 đầu. */
  from?: string;
  to?: string;
  /** V3.16 — bảng phẳng thay thư mục: sort theo Ngày tạo. Mặc định "desc". */
  sortDir?: "asc" | "desc";
  /**
   * L13 — tìm theo mã phiếu / số phiếu giấy / tiêu đề / tên-mã vật tư (mọi dòng) /
   * người lập (họ tên hoặc username).
   */
  q?: string;
  /**
   * L5 — người đang xem: phiếu NHÁP của người khác bị loại khỏi danh sách
   * (admin thấy tất cả). Bỏ qua → không lọc (chỉ dùng cho job nội bộ).
   */
  viewer?: { userId: string; isAdmin: boolean };
  page: number;
  pageSize: number;
}

export interface PRStatusCounts {
  /** Số phiếu theo `status` (áp mọi bộ lọc TRỪ status — để hiện số trên tab). */
  byStatus: Partial<Record<PurchaseRequestStatus, number>>;
  /** Phiếu SUBMITTED tách theo bước: chờ Kho (SUBMITTED) / chờ duyệt cuối (DEPT_APPROVED). */
  bySubmittedStep: { SUBMITTED: number; DEPT_APPROVED: number };
  /** A14 — số phiếu Hoàn tất (approval_step DONE), tách khỏi "Đã duyệt". */
  completed: number;
  /** A14 — như byStatus nhưng KHÔNG tính phiếu Hoàn tất (số cho tab "Đã duyệt"/"Đã chuyển PO"). */
  byStatusActive: Partial<Record<PurchaseRequestStatus, number>>;
  all: number;
}

export interface ListPRsResult {
  rows: (PurchaseRequest & { displayLabel: string; requestedByName: string | null })[];
  total: number;
  counts: PRStatusCounts;
}

/** Escape ký tự đặc biệt của LIKE/ILIKE (\ % _). */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * L5 — điều kiện SQL: phiếu NHÁP chỉ chủ phiếu (và admin) thấy. Trả undefined
 * khi không cần lọc (admin / không có viewer).
 */
export function draftVisibilityCondition(
  viewer: { userId: string; isAdmin: boolean } | undefined,
): SQL | undefined {
  if (!viewer || viewer.isAdmin) return undefined;
  return sql`(${purchaseRequest.status} <> 'DRAFT' OR ${purchaseRequest.requestedBy} = ${viewer.userId})`;
}

/**
 * V3.16 (mục 1) — Lấy `name`/`sku` của DÒNG VẬT TƯ ĐẦU TIÊN (theo line_no) +
 * tổng số dòng cho mỗi PR, qua correlated subquery trong CÙNG 1 câu SELECT
 * (không phải N+1 round-trip — Postgres tự chạy các subquery này như index
 * seek nhờ unique index `pr_line_uk (pr_id, line_no)`). Dùng cho `displayLabel`
 * ở bảng danh sách — tránh phải JOIN/tải hết mọi dòng chỉ để lấy dòng đầu.
 */
const firstLineNameExpr = sql<string | null>`(
  SELECT COALESCE(${item.name}, ${purchaseRequestLine.itemName})
  FROM ${purchaseRequestLine}
  LEFT JOIN ${item} ON ${item.id} = ${purchaseRequestLine.itemId}
  WHERE ${purchaseRequestLine.prId} = ${purchaseRequest.id}
  ORDER BY ${purchaseRequestLine.lineNo} ASC
  LIMIT 1
)`;
const firstLineSkuExpr = sql<string | null>`(
  SELECT COALESCE(${item.sku}, ${purchaseRequestLine.itemSku})
  FROM ${purchaseRequestLine}
  LEFT JOIN ${item} ON ${item.id} = ${purchaseRequestLine.itemId}
  WHERE ${purchaseRequestLine.prId} = ${purchaseRequest.id}
  ORDER BY ${purchaseRequestLine.lineNo} ASC
  LIMIT 1
)`;
const lineCountExpr = sql<number>`(
  SELECT count(*)::int FROM ${purchaseRequestLine}
  WHERE ${purchaseRequestLine.prId} = ${purchaseRequest.id}
)`;

export async function listPRs(q: ListPRsQuery): Promise<ListPRsResult> {
  const where: SQL[] = [];
  const statusOnly =
    q.status && q.status.length > 0
      ? inArray(
          purchaseRequest.status,
          q.status as unknown as (typeof purchaseRequest.status.enumValues)[number][],
        )
      : undefined;
  // Tab "Đã duyệt" (chỉ APPROVED) KHÔNG chứa phiếu đã Hoàn tất (completed_at) — các phiếu đó
  // thuộc tab "Hoàn tất" (completed=1). Chỉ ép khi chưa truyền `completed` tường minh.
  const onlyApprovedTab = q.status?.length === 1 && q.status[0] === "APPROVED";
  const completedWanted = q.completed ?? (onlyApprovedTab ? false : undefined);
  const completedCond =
    completedWanted === undefined
      ? undefined
      : completedWanted
        ? sql`${purchaseRequest.completedAt} IS NOT NULL`
        : sql`${purchaseRequest.completedAt} IS NULL`;
  const statusCond =
    statusOnly && completedCond ? and(statusOnly, completedCond) : statusOnly ?? completedCond;
  const draftCond = draftVisibilityCondition(q.viewer);
  if (draftCond) where.push(draftCond);
  const term = q.q?.trim();
  if (term) {
    const like = `%${escapeLike(term)}%`;
    // A14 — tìm KHÔNG DẤU ("vat tu" ra "Vật tư"): so khớp public.f_unaccent (0002c) 2 vế.
    const ci = (col: unknown) => sql`public.f_unaccent(${col}::text) ILIKE public.f_unaccent(${like})`;
    where.push(sql`(
      ${ci(purchaseRequest.code)}
      OR ${ci(sql`COALESCE(${purchaseRequest.paperFormNo}, '')`)}
      OR ${ci(sql`COALESCE(${purchaseRequest.title}, '')`)}
      OR EXISTS (
        SELECT 1 FROM ${purchaseRequestLine} qpl
        LEFT JOIN ${item} qit ON qit.id = qpl.item_id
        WHERE qpl.pr_id = ${purchaseRequest.id}
          AND (
            ${ci(sql`COALESCE(qit.name, qpl.item_name, '')`)}
            OR ${ci(sql`COALESCE(qit.sku, qpl.item_sku, '')`)}
          )
      )
      OR EXISTS (
        SELECT 1 FROM ${userAccount} qu
        WHERE qu.id = ${purchaseRequest.requestedBy}
          AND (${ci(sql`COALESCE(qu.full_name, '')`)} OR ${ci(sql`qu.username`)})
      )
    )`);
  }
  if (q.linkedOrderId) where.push(eq(purchaseRequest.linkedOrderId, q.linkedOrderId));
  if (q.requestedBy) where.push(eq(purchaseRequest.requestedBy, q.requestedBy));
  if (q.date) {
    where.push(
      sql`(${purchaseRequest.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ${q.date}::date`,
    );
  }
  // V3.16 — bảng phẳng thay thư mục: filter khoảng ngày [from, to] (1 hoặc cả
  // 2 đầu). Cùng pattern AT TIME ZONE với listPRsInRange().
  if (q.from && q.to) {
    where.push(
      sql`(${purchaseRequest.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN ${q.from}::date AND ${q.to}::date`,
    );
  } else if (q.from) {
    where.push(
      sql`(${purchaseRequest.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ${q.from}::date`,
    );
  } else if (q.to) {
    where.push(
      sql`(${purchaseRequest.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= ${q.to}::date`,
    );
  }
  if (q.bomTemplateId) {
    // V1.8 — PR.linked_order_id → sales_order.bom_template_id. PR manual không
    // gắn linked_order_id sẽ không lọt vào workspace scope — đúng ý đồ.
    where.push(eq(salesOrder.bomTemplateId, q.bomTemplateId));
  }

  // whereBase = mọi bộ lọc TRỪ status (dùng đếm số trên từng tab).
  const whereBase = where.length > 0 ? and(...where) : sql`true`;
  const whereExpr = statusCond ? and(whereBase, statusCond) : whereBase;
  const offset = (q.page - 1) * q.pageSize;

  const requestedByNameExpr = sql<string | null>`(
    SELECT COALESCE(ua.full_name, ua.username) FROM ${userAccount} ua
    WHERE ua.id = ${purchaseRequest.requestedBy}
  )`;

  const baseQuery = db
    .select({
      pr: purchaseRequest,
      firstLineName: firstLineNameExpr,
      firstLineSku: firstLineSkuExpr,
      lineCount: lineCountExpr,
      requestedByName: requestedByNameExpr,
    })
    .from(purchaseRequest)
    .leftJoin(salesOrder, eq(salesOrder.id, purchaseRequest.linkedOrderId));

  const [totalResult, rows, countRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseRequest)
      .leftJoin(salesOrder, eq(salesOrder.id, purchaseRequest.linkedOrderId))
      .where(whereExpr),
    baseQuery
      .where(whereExpr)
      .orderBy(
        q.sortDir === "asc"
          ? asc(purchaseRequest.createdAt)
          : desc(purchaseRequest.createdAt),
      )
      .limit(q.pageSize)
      .offset(offset),
    db
      .select({
        status: purchaseRequest.status,
        step: purchaseRequest.approvalStep,
        done: sql<boolean>`(${purchaseRequest.completedAt} IS NOT NULL)`,
        count: sql<number>`count(*)::int`,
      })
      .from(purchaseRequest)
      .leftJoin(salesOrder, eq(salesOrder.id, purchaseRequest.linkedOrderId))
      .where(whereBase)
      .groupBy(
        purchaseRequest.status,
        purchaseRequest.approvalStep,
        sql`(${purchaseRequest.completedAt} IS NOT NULL)`,
      ),
  ]);

  const counts: PRStatusCounts = {
    byStatus: {},
    bySubmittedStep: { SUBMITTED: 0, DEPT_APPROVED: 0 },
    completed: 0,
    byStatusActive: {},
    all: 0,
  };
  for (const c of countRows) {
    const st = c.status as PurchaseRequestStatus;
    // Phiếu Hoàn tất (completed_at) tách khỏi tab trạng thái của nó: byStatus KHÔNG tính chúng.
    if (c.done) counts.completed += c.count;
    else {
      counts.byStatus[st] = (counts.byStatus[st] ?? 0) + c.count;
      counts.byStatusActive[st] = (counts.byStatusActive[st] ?? 0) + c.count;
    }
    counts.all += c.count;
    if (st === "SUBMITTED") {
      if (c.step === "DEPT_APPROVED") counts.bySubmittedStep.DEPT_APPROVED += c.count;
      else counts.bySubmittedStep.SUBMITTED += c.count;
    }
  }

  return {
    rows: rows.map((r) => ({
      ...r.pr,
      requestedByName: r.requestedByName ?? null,
      displayLabel: deriveDisplayLabel(
        [{ name: r.firstLineName, sku: r.firstLineSku }],
        60,
        r.lineCount,
      ),
    })),
    total: totalResult[0]?.count ?? 0,
    counts,
  };
}

export interface PRDayBucket {
  day: string;
  count: number;
  statuses: Record<PurchaseRequestStatus, number>;
}

/**
 * V3.13 — Gom số phiếu PR theo ngày (giờ +07) để dựng "thư mục ngày".
 * requestedBy: giới hạn theo ownership (operator/qc chỉ thấy phiếu mình tạo).
 */
export async function listPRDayBuckets(q: {
  requestedBy?: string;
  viewer?: { userId: string; isAdmin: boolean };
}): Promise<PRDayBucket[]> {
  const where: SQL[] = [];
  const draftCond = draftVisibilityCondition(q.viewer);
  if (draftCond) where.push(draftCond);
  if (q.requestedBy) where.push(eq(purchaseRequest.requestedBy, q.requestedBy));
  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const dayExpr = sql<string>`to_char(${purchaseRequest.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      day: dayExpr,
      count: sql<number>`count(*)::int`,
      draft: sql<number>`count(*) filter (where ${purchaseRequest.status} = 'DRAFT')::int`,
      submitted: sql<number>`count(*) filter (where ${purchaseRequest.status} = 'SUBMITTED')::int`,
      approved: sql<number>`count(*) filter (where ${purchaseRequest.status} = 'APPROVED')::int`,
      converted: sql<number>`count(*) filter (where ${purchaseRequest.status} = 'CONVERTED')::int`,
      rejected: sql<number>`count(*) filter (where ${purchaseRequest.status} = 'REJECTED')::int`,
      // V4.4 (Việc 4, migration 0069) — cần enum app.purchase_request_status
      // đã có value 'CANCELLED' mới chạy được (ALTER TYPE ADD VALUE).
      cancelled: sql<number>`count(*) filter (where ${purchaseRequest.status} = 'CANCELLED')::int`,
    })
    .from(purchaseRequest)
    .where(whereExpr)
    .groupBy(dayExpr)
    .orderBy(desc(dayExpr));

  return rows.map((r) => ({
    day: r.day,
    count: r.count,
    statuses: {
      DRAFT: r.draft,
      SUBMITTED: r.submitted,
      APPROVED: r.approved,
      CONVERTED: r.converted,
      REJECTED: r.rejected,
      CANCELLED: r.cancelled,
    },
  }));
}

/** V3.14 — Cap số phiếu export 1 lần (tránh workbook khổng lồ nếu range quá rộng). */
const PR_RANGE_EXPORT_CAP = 2000;

export interface PRSlipLine {
  lineNo: number;
  sku: string | null;
  name: string | null;
  specification: string | null;
  uom: string | null;
  qty: string;
  priority: string | null;
  category: string | null;
  estimatedUnitPrice: string | null;
  notes: string | null;
  // V3.15 — bổ sung để render đúng template phiếu gốc (YCVT/DNVT).
  onHandSnapshot: string | null;
  approvedQty: string | null;
  neededBy: string | null;
  referenceCode: string | null;
  referenceNote: string | null;
  deliveryDate: string | null;
}

export interface PRSlip extends PurchaseRequest {
  lines: PRSlipLine[];
  requestedByName: string | null;
  // V3.15 — tên người duyệt để điền mục III template phiếu gốc.
  deptApprovedByName: string | null;
  directorApprovedByName: string | null;
}

/**
 * V3.14 — Lấy toàn bộ PR (kèm lines) tạo trong khoảng [from, to] (giờ +07) để
 * export Excel "mỗi phiếu 1 sheet". Không phân trang — lines + tên người đề
 * xuất lấy qua bulk query (tránh N+1); getPRLinesEnriched không tái dùng được
 * vì nó chỉ nhận 1 prId.
 */
export async function listPRsInRange(q: {
  from: string;
  to: string;
  requestedBy?: string;
  viewer?: { userId: string; isAdmin: boolean };
}): Promise<PRSlip[]> {
  const where: SQL[] = [
    sql`(${purchaseRequest.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN ${q.from}::date AND ${q.to}::date`,
  ];
  const draftCond = draftVisibilityCondition(q.viewer);
  if (draftCond) where.push(draftCond);
  if (q.requestedBy) where.push(eq(purchaseRequest.requestedBy, q.requestedBy));
  const whereExpr = and(...where);

  const headers = await db
    .select()
    .from(purchaseRequest)
    .where(whereExpr)
    .orderBy(purchaseRequest.createdAt)
    .limit(PR_RANGE_EXPORT_CAP);

  const ids = headers.map((h) => h.id);
  const linesByPr = new Map<string, PRSlipLine[]>();
  if (ids.length > 0) {
    const lineRows = await db
      .select({
        prId: purchaseRequestLine.prId,
        lineNo: purchaseRequestLine.lineNo,
        masterSku: item.sku,
        masterName: item.name,
        masterUom: item.uom,
        itemSku: purchaseRequestLine.itemSku,
        itemName: purchaseRequestLine.itemName,
        specification: purchaseRequestLine.specification,
        uom: purchaseRequestLine.uom,
        qty: purchaseRequestLine.qty,
        priority: purchaseRequestLine.priority,
        category: purchaseRequestLine.category,
        estimatedUnitPrice: purchaseRequestLine.estimatedUnitPrice,
        notes: purchaseRequestLine.notes,
        onHandSnapshot: purchaseRequestLine.onHandSnapshot,
        approvedQty: purchaseRequestLine.approvedQty,
        neededBy: purchaseRequestLine.neededBy,
        referenceCode: purchaseRequestLine.referenceCode,
        referenceNote: purchaseRequestLine.referenceNote,
        deliveryDate: purchaseRequestLine.deliveryDate,
      })
      .from(purchaseRequestLine)
      .leftJoin(item, eq(item.id, purchaseRequestLine.itemId))
      .where(inArray(purchaseRequestLine.prId, ids))
      .orderBy(purchaseRequestLine.prId, purchaseRequestLine.lineNo);
    for (const l of lineRows) {
      const arr = linesByPr.get(l.prId) ?? [];
      arr.push({
        lineNo: l.lineNo,
        sku: l.masterSku ?? l.itemSku ?? null,
        name: l.masterName ?? l.itemName ?? null,
        specification: l.specification,
        uom: l.uom ?? l.masterUom ?? null,
        qty: l.qty,
        priority: l.priority,
        category: l.category,
        estimatedUnitPrice: l.estimatedUnitPrice,
        notes: l.notes,
        onHandSnapshot: l.onHandSnapshot,
        approvedQty: l.approvedQty,
        neededBy: l.neededBy,
        referenceCode: l.referenceCode,
        referenceNote: l.referenceNote,
        deliveryDate: l.deliveryDate,
      });
      linesByPr.set(l.prId, arr);
    }
  }

  // Resolve tên cho requester + trưởng bộ phận + giám đốc (1 query bulk).
  const userIds = Array.from(
    new Set(
      headers
        .flatMap((h) => [h.requestedBy, h.deptApprovedBy, h.directorApprovedBy])
        .filter((id): id is string => !!id),
    ),
  );
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await db
      .select({
        id: userAccount.id,
        fullName: userAccount.fullName,
        username: userAccount.username,
      })
      .from(userAccount)
      .where(inArray(userAccount.id, userIds));
    for (const u of users) userMap.set(u.id, u.fullName ?? u.username);
  }

  return headers.map((h) => ({
    ...h,
    lines: linesByPr.get(h.id) ?? [],
    requestedByName: h.requestedBy ? userMap.get(h.requestedBy) ?? null : null,
    deptApprovedByName: h.deptApprovedBy
      ? userMap.get(h.deptApprovedBy) ?? null
      : null,
    directorApprovedByName: h.directorApprovedBy
      ? userMap.get(h.directorApprovedBy) ?? null
      : null,
  }));
}

export async function getPR(id: string): Promise<PurchaseRequest | null> {
  const [row] = await db
    .select()
    .from(purchaseRequest)
    .where(eq(purchaseRequest.id, id))
    .limit(1);
  return row ?? null;
}

export async function getPRLines(prId: string): Promise<PurchaseRequestLine[]> {
  return db
    .select()
    .from(purchaseRequestLine)
    .where(eq(purchaseRequestLine.prId, prId))
    .orderBy(purchaseRequestLine.lineNo);
}

export interface CreatePRLineInput {
  /** V3.7.72 — Nullable: cho phép free-text item chưa có trong master. */
  itemId?: string | null;
  itemName?: string | null;
  itemSku?: string | null;
  qty: number;
  preferredSupplierId?: string | null;
  snapshotLineId?: string | null;
  neededBy?: Date | null;
  notes?: string | null;
  // V3.7.55 — MRF GTAM fields
  specification?: string | null;
  uom?: string | null;
  priority?: "URGENT" | "NORMAL" | "RESERVE" | null;
  category?: "TOOL" | "CONSUMABLE" | "MATERIAL" | "OTHER" | null;
  estimatedUnitPrice?: number | null;
  referenceCode?: string | null;
  // V3.7.69 YCVT — Tồn kho lúc tạo (auto-fill từ inventory_balance).
  onHandSnapshot?: number | null;
  // V3.10 DNVT — Tham khảo + Ngày giao hàng.
  referenceNote?: string | null;
  deliveryDate?: Date | null;
}

export interface CreatePRInput {
  title?: string | null;
  source?: "SHORTAGE" | "MANUAL";
  linkedOrderId?: string | null;
  /** V4.4 (Việc 1, migration 0069) — PR sinh từ "Xin vật tư theo BOM" của 1 WO. */
  linkedWoId?: string | null;
  requestedBy: string | null;
  notes?: string | null;
  lines: CreatePRLineInput[];
  // V3.7.55 — MRF GTAM header fields
  targetDepartment?: string | null;
  proposingDepartment?: string | null;
  requestReason?: string | null;
  // V3.10 — Loại phiếu trình bày ('MRF' | 'DNVT').
  formType?: "MRF" | "DNVT" | null;
}

/** Lỗi nghiệp vụ khi tạo/sửa phiếu (route map sang 422 tiếng Việt). */
export class PrValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "PrValidationError";
  }
}

/** THUẦN — vật tư dùng được cho phiếu mới: tồn tại, ACTIVE và chưa bị vô hiệu hoá (xoá mềm). */
export function isItemUsableForPR(i: { status: string; isActive: boolean }): boolean {
  return i.status === "ACTIVE" && i.isActive;
}

/**
 * L9/L10 — kiểm TRƯỚC khi cấp mã PR: mọi itemId phải tồn tại + ACTIVE. Trước đây
 * itemId lạ ném FK → 500 và đã tiêu 1 mã PR; vật tư xoá mềm vẫn gắn được.
 * Throw PrValidationError (422) nêu rõ dòng sai.
 */
export async function assertPrItemsUsable(
  lines: { itemId?: string | null }[],
): Promise<void> {
  const ids = Array.from(
    new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x)),
  );
  if (ids.length === 0) return;
  const found = await db
    .select({
      id: item.id,
      sku: item.sku,
      name: item.name,
      status: item.status,
      isActive: item.isActive,
    })
    .from(item)
    .where(inArray(item.id, ids));
  const byId = new Map(found.map((f) => [f.id, f]));
  const problems: string[] = [];
  lines.forEach((l, idx) => {
    if (!l.itemId) return;
    const it = byId.get(l.itemId);
    if (!it) {
      problems.push(`Dòng ${idx + 1}: vật tư không tồn tại trong danh mục.`);
    } else if (!isItemUsableForPR(it)) {
      problems.push(
        `Dòng ${idx + 1}: vật tư ${it.sku} đã bị vô hiệu hoá — chọn vật tư khác hoặc nhập tay.`,
      );
    }
  });
  if (problems.length > 0) {
    throw new PrValidationError("ITEM_INVALID", problems.slice(0, 5).join(" "));
  }
}

async function genPRCode(): Promise<string> {
  const rows = await db.execute(sql`SELECT app.gen_pr_code() AS code`);
  const row = (rows as unknown as Array<{ code: string }>)[0];
  if (!row) throw new Error("PR_CODE_GEN_FAILED");
  return row.code;
}

/** Executor tối thiểu cho genPaperFormNo (db hoặc tx đều thoả). */
type Executor = Pick<typeof db, "execute">;

/**
 * V3.7.69 YCVT — sinh số phiếu giấy `{seq}/PRD-MRF/{MMYY}`.
 * Gọi khi user bấm "Gửi phiếu" (transition DRAFT → SUBMITTED).
 *
 * V3.11.4 (audit 1.29/1.21) — nhận executor (tx) để chạy TRONG transaction
 * submitPR + advisory lock chống 2 submit đồng thời sinh trùng số phiếu giấy
 * (gen_pr_paper_form_no dùng MAX+1 không lock). Lock scope theo tháng MMYY.
 */
async function genPaperFormNo(exec: Executor = db, lock = true): Promise<string> {
  if (lock) {
    // MMYY Asia/Ho_Chi_Minh — khớp scope reset seq của DB function.
    await exec.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('pr_paper_form:' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'MMYY')))`,
    );
  }
  const rows = await exec.execute(sql`SELECT app.gen_pr_paper_form_no() AS no`);
  const row = (rows as unknown as Array<{ no: string }>)[0];
  if (!row) throw new Error("PR_PAPER_NO_GEN_FAILED");
  return row.no;
}

/**
 * V3.7.69 YCVT — preview số phiếu kế tiếp KHÔNG consume sequence.
 * Dùng để hiện trên UI lúc user đang nhập form (read-only preview).
 */
export async function previewNextPaperFormNo(): Promise<string> {
  // Lưu ý: gọi gen function thật sẽ không tăng counter vì counter là MAX(...)+1.
  // Preview không cần advisory lock (read-only, không ghi).
  return genPaperFormNo(db, false);
}

/**
 * Tạo PR mới (DRAFT) + lines. Atomic transaction.
 */
export async function createPR(input: CreatePRInput): Promise<PurchaseRequest> {
  if (input.lines.length === 0) throw new Error("PR_MUST_HAVE_LINES");

  return db.transaction(async (tx) => {
    const code = await genPRCode();

    const [header] = await tx
      .insert(purchaseRequest)
      .values({
        code,
        title: input.title ?? null,
        status: "DRAFT",
        source: input.source ?? "MANUAL",
        linkedOrderId: input.linkedOrderId ?? null,
        linkedWoId: input.linkedWoId ?? null,
        requestedBy: input.requestedBy,
        notes: input.notes ?? null,
        targetDepartment: input.targetDepartment ?? null,
        proposingDepartment: input.proposingDepartment ?? null,
        requestReason: input.requestReason ?? null,
        // V3.10 — discriminator loại phiếu.
        formType: input.formType ?? "MRF",
      })
      .returning();
    if (!header) throw new Error("PR_INSERT_FAILED");

    // V4.0 Wave 3 Phase B — mã ID hệ thống duy nhất cho từng dòng, sinh 1 lượt
    // trong cùng advisory lock (genDocNoBatch) để tránh trùng khi nhiều PR
    // được tạo đồng thời.
    const lineRefCodes = await genDocNoBatch(
      tx,
      {
        table: "app.purchase_request_line",
        column: "line_ref_code",
        prefix: `PRL-${currentYymm()}`,
        seqPart: 3,
        pad: 5,
      },
      input.lines.length,
    );

    await tx.insert(purchaseRequestLine).values(
      input.lines.map((l, idx) => ({
        prId: header.id,
        lineNo: idx + 1,
        itemId: l.itemId ?? null,
        // V3.7.72 — Free-text name/sku khi itemId null
        itemName: l.itemName ?? null,
        itemSku: l.itemSku ?? null,
        qty: String(l.qty),
        preferredSupplierId: l.preferredSupplierId ?? null,
        snapshotLineId: l.snapshotLineId ?? null,
        neededBy: l.neededBy ? l.neededBy.toISOString().slice(0, 10) : null,
        notes: l.notes ?? null,
        // V3.7.55 — MRF GTAM line fields
        specification: l.specification ?? null,
        uom: l.uom ?? null,
        priority: l.priority ?? "NORMAL",
        category: l.category ?? null,
        estimatedUnitPrice:
          l.estimatedUnitPrice != null ? String(l.estimatedUnitPrice) : null,
        referenceCode: l.referenceCode ?? null,
        // V3.7.69 YCVT
        onHandSnapshot:
          l.onHandSnapshot != null ? String(l.onHandSnapshot) : null,
        // V3.10 DNVT
        referenceNote: l.referenceNote ?? null,
        deliveryDate: l.deliveryDate
          ? l.deliveryDate.toISOString().slice(0, 10)
          : null,
        // V4.0 Wave 3 Phase B
        lineRefCode: lineRefCodes[idx],
      })),
    );

    return header;
  });
}

/**
 * Tạo PR từ shortage: lấy snapshot_line cho các itemIds → group by item →
 * sum remaining_short_qty × 1.1 (buffer 10%) → tạo PR.
 */
export async function createPRFromShortage(
  itemIds: string[],
  userId: string | null,
  options: { title?: string | null } = {},
): Promise<PurchaseRequest> {
  if (itemIds.length === 0) throw new Error("NO_ITEMS_SELECTED");

  // Aggregate shortage per item (PLANNED/PURCHASING state, qty > 0)
  const shortageRows = await db.execute(sql`
    SELECT
      bsl.component_item_id AS item_id,
      SUM(bsl.remaining_short_qty) AS total_short,
      (array_agg(bsl.id ORDER BY bsl.id))[1] AS sample_line_id,
      (array_agg(bsl.order_id ORDER BY bsl.order_id))[1] AS linked_order_id
    FROM app.bom_snapshot_line bsl
    WHERE bsl.component_item_id = ANY(${uuidArray(itemIds)})
      AND bsl.state IN ('PLANNED', 'PURCHASING')
      AND bsl.remaining_short_qty > 0
    GROUP BY bsl.component_item_id
  `);
  const rows = shortageRows as unknown as Array<{
    item_id: string;
    total_short: string;
    sample_line_id: string;
    linked_order_id: string;
  }>;

  if (rows.length === 0) throw new Error("NO_SHORTAGE_FOUND");

  const lines: CreatePRLineInput[] = rows.map((r) => ({
    itemId: r.item_id,
    // V4.1 TM-23 — làm tròn 4 số lẻ (float `x*1.1` ra 10.000000000000002).
    qty: Math.round(Number.parseFloat(r.total_short) * 1.1 * 10_000) / 10_000, // 10% buffer
    snapshotLineId: r.sample_line_id,
  }));

  return createPR({
    // V4.1 TM-24 — ngày theo giờ VN (0h-7h sáng không lùi 1 ngày).
    title: options.title ?? `Đề xuất mua do thiếu vật tư ${vnToday()}`,
    source: "SHORTAGE",
    linkedOrderId: rows[0]?.linked_order_id ?? null,
    requestedBy: userId,
    lines,
  });
}

/**
 * V3.4 — Replace toàn bộ lines của PR (DRAFT/SUBMITTED only).
 * Strategy: delete tất cả + insert lại theo input. Đơn giản hơn diff cá nhân
 * từng line, dù cost cao hơn 1 chút (PR thường < 50 lines).
 */
export interface ReplacePRLineInput {
  /** V3.7.72 — Nullable. */
  itemId?: string | null;
  itemName?: string | null;
  itemSku?: string | null;
  qty: number;
  preferredSupplierId?: string | null;
  snapshotLineId?: string | null;
  neededBy?: Date | null;
  notes?: string | null;
  // V3.7.55 — MRF GTAM fields
  specification?: string | null;
  uom?: string | null;
  priority?: "URGENT" | "NORMAL" | "RESERVE" | null;
  category?: "TOOL" | "CONSUMABLE" | "MATERIAL" | "OTHER" | null;
  estimatedUnitPrice?: number | null;
  referenceCode?: string | null;
  // V3.7.69 YCVT
  onHandSnapshot?: number | null;
  // V3.10 DNVT
  referenceNote?: string | null;
  deliveryDate?: Date | null;
  // V4.1 TM-12 — SL duyệt (Kho ghi ở bước 2).
  approvedQty?: number | null;
}

type PrTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function replacePRLines(
  prId: string,
  lines: ReplacePRLineInput[],
  /** V4.1 TM-12 — chạy trong transaction của caller (sửa header + dòng cùng lúc). */
  outerTx?: PrTx,
): Promise<void> {
  if (lines.length === 0) throw new Error("PR_MUST_HAVE_LINES");
  const run = async (tx: PrTx) => {
    await tx
      .delete(purchaseRequestLine)
      .where(eq(purchaseRequestLine.prId, prId));

    // V4.0 Wave 3 Phase B — replace xoá-tạo lại toàn bộ dòng (kể cả dòng
    // không đổi) nên mã ref cũ không giữ được; sinh lại mã mới cho tất cả,
    // chấp nhận "tốn" số thứ tự khi sửa DRAFT nhiều lần (đơn giản, đúng KISS —
    // mã chỉ cần duy nhất, không cần liên tục).
    const lineRefCodes = await genDocNoBatch(
      tx,
      {
        table: "app.purchase_request_line",
        column: "line_ref_code",
        prefix: `PRL-${currentYymm()}`,
        seqPart: 3,
        pad: 5,
      },
      lines.length,
    );

    await tx.insert(purchaseRequestLine).values(
      lines.map((l, idx) => ({
        prId,
        lineNo: idx + 1,
        itemId: l.itemId ?? null,
        itemName: l.itemName ?? null,
        itemSku: l.itemSku ?? null,
        qty: String(l.qty),
        preferredSupplierId: l.preferredSupplierId ?? null,
        snapshotLineId: l.snapshotLineId ?? null,
        neededBy: l.neededBy ? l.neededBy.toISOString().slice(0, 10) : null,
        notes: l.notes ?? null,
        // V3.7.55 — MRF GTAM line fields
        specification: l.specification ?? null,
        uom: l.uom ?? null,
        priority: l.priority ?? "NORMAL",
        category: l.category ?? null,
        estimatedUnitPrice:
          l.estimatedUnitPrice != null ? String(l.estimatedUnitPrice) : null,
        referenceCode: l.referenceCode ?? null,
        // V3.7.69 YCVT
        onHandSnapshot:
          l.onHandSnapshot != null ? String(l.onHandSnapshot) : null,
        // V3.10 DNVT
        referenceNote: l.referenceNote ?? null,
        deliveryDate: l.deliveryDate
          ? l.deliveryDate.toISOString().slice(0, 10)
          : null,
        // V4.0 Wave 3 Phase B
        lineRefCode: lineRefCodes[idx],
        // V4.1 TM-12 — không làm mất SL duyệt khi sửa phiếu.
        // A1 — kẹp ≤ SL đề xuất (đường gọi duy nhất hiện tại không truyền).
        approvedQty:
          effectiveApprovedQty(l.qty, l.approvedQty) != null
            ? String(effectiveApprovedQty(l.qty, l.approvedQty))
            : null,
      })),
    );
  };
  if (outerTx) await run(outerTx);
  else await db.transaction(run);
}

/**
 * Submit PR DRAFT → SUBMITTED.
 * V3.7.69 YCVT — đồng thời sinh paper_form_no nếu chưa có + set approval_step.
 */
export async function submitPR(id: string): Promise<PurchaseRequest | null> {
  return db.transaction(async (tx) => {
    // Check current state
    const [current] = await tx
      .select({
        id: purchaseRequest.id,
        status: purchaseRequest.status,
        paperFormNo: purchaseRequest.paperFormNo,
      })
      .from(purchaseRequest)
      .where(eq(purchaseRequest.id, id))
      .limit(1);
    if (!current || current.status !== "DRAFT") return null;

    // V3.11.4 — sinh số phiếu giấy TRONG transaction (tx) + advisory lock.
    const paperFormNo = current.paperFormNo ?? (await genPaperFormNo(tx));

    const [row] = await tx
      .update(purchaseRequest)
      .set({
        status: "SUBMITTED",
        approvalStep: "SUBMITTED",
        paperFormNo,
        updatedAt: new Date(),
      })
      .where(and(eq(purchaseRequest.id, id), eq(purchaseRequest.status, "DRAFT")))
      .returning();
    return row ?? null;
  });
}

/** L1 — lỗi nghiệp vụ khi duyệt Kho / kiểm tồn lại (route map ra HTTP). */
export class PrApprovalError extends Error {
  constructor(
    public readonly code: "VALIDATION" | "STOCK_SHORT" | "INVALID_STATE",
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "PrApprovalError";
  }
}

/**
 * L1 — khoá advisory theo TỪNG vật tư của phiếu (theo thứ tự id để tránh deadlock)
 * trong transaction: hai phiếu cùng vật tư duyệt đồng thời xếp hàng, phiếu sau thấy
 * phần giữ chỗ của phiếu trước.
 */
async function lockPrItemsForStock(tx: PrTx, prId: string): Promise<void> {
  const rows = await tx
    .select({ itemId: purchaseRequestLine.itemId })
    .from(purchaseRequestLine)
    .where(eq(purchaseRequestLine.prId, prId));
  const ids = Array.from(new Set(rows.map((r) => r.itemId).filter((x): x is string => !!x))).sort();
  for (const itemId of ids) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"pr-stock:" + itemId}, 0))`);
  }
}

/** L1 — trong transaction + đã khoá: tính SL cần mua rồi kiểm không vượt tồn khả dụng (sau giữ chỗ). */
async function resolveAndCheckDecisions(
  tx: PrTx,
  prId: string,
  buyQtys: Record<string, number> | undefined,
): Promise<Record<string, number>> {
  const stock = await getPrStockCheck(prId, tx);
  const resolved = resolveBuyDecisions(stock, buyQtys);
  if (!resolved.ok) throw new PrApprovalError("VALIDATION", resolved.message, 422);
  const over = checkStockCommitment(stock, resolved.decisions);
  if (over) throw new PrApprovalError("STOCK_SHORT", over, 422);
  return resolved.decisions;
}

/**
 * V3.7.69 YCVT — Step 2: Trưởng bộ phận duyệt.
 * SUBMITTED → DEPT_APPROVED.
 *
 * L1 — kiểm tồn + UPDATE trong CÙNG transaction, có khoá advisory theo vật tư.
 * `buyQtys` = Kho nhập (lineId → SL CẦN MUA); bỏ trống → mặc định theo tồn khả dụng.
 * Mọi dòng cần mua = 0 → bỏ qua duyệt cuối (status APPROVED luôn).
 */
export async function deptApprovePR(
  id: string,
  approverId: string,
  note?: string | null,
  buyQtys?: Record<string, number>,
): Promise<
  | (PurchaseRequest & {
      autoFinal: boolean;
      decisions: Record<string, number>;
      summary: ReturnType<typeof summarizeBuyDecisions>;
    })
  | null
> {
  return db.transaction(async (tx) => {
    const now = new Date();
    await lockPrItemsForStock(tx, id);
    const decisions = await resolveAndCheckDecisions(tx, id, buyQtys);
    const summary = summarizeBuyDecisions(decisions);
    const autoFinal = summary.allCovered;
    const [row] = await tx
      .update(purchaseRequest)
      .set({
        approvalStep: autoFinal ? "DIRECTOR_APPROVED" : "DEPT_APPROVED",
        deptApprovedBy: approverId,
        deptApprovedAt: now,
        deptApprovalNote: note ?? null,
        ...(autoFinal
          ? {
              status: "APPROVED" as const,
              approvedBy: approverId,
              approvedAt: now,
              directorApprovalNote: "Tự động: Kho đáp ứng đủ từ tồn — không cần mua",
            }
          : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(purchaseRequest.id, id),
          eq(purchaseRequest.approvalStep, "SUBMITTED"),
        ),
      )
      .returning();
    if (!row) return null;
    await writeBuyDecisions(tx, id, decisions);
    return Object.assign(row, { autoFinal, decisions, summary });
  });
}

/** Ghi approved_qty (SL cần mua) cho các dòng của PR — chỉ gọi từ duyệt Kho / quick-approve. */
async function writeBuyDecisions(
  tx: PrTx,
  prId: string,
  decisions: Record<string, number>,
): Promise<void> {
  for (const [lineId, buy] of Object.entries(decisions)) {
    await tx
      .update(purchaseRequestLine)
      .set({ approvedQty: String(buy) })
      .where(and(eq(purchaseRequestLine.id, lineId), eq(purchaseRequestLine.prId, prId)));
  }
}

/**
 * L1 — SL đã "giữ chỗ mềm" theo vật tư bởi các phiếu KHÁC: phiếu đã qua Kho duyệt
 * (DEPT_APPROVED / APPROVED / CONVERTED) mà chưa hoàn tất, phần xuất từ kho
 * (qty − cần mua) còn chưa xuất. Tính động, không có bảng riêng.
 */
export async function getCommittedByItem(
  itemIds: string[],
  excludePrId: string,
  exec: Executor = db,
): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();
  const rows = (await exec.execute(sql`
    SELECT l.item_id::text AS "itemId", l.qty::text AS qty,
           l.approved_qty::text AS "approvedQty",
           COALESCE((SELECT SUM(gil.qty) FROM app.goods_issue_line gil
                     WHERE gil.purchase_request_line_id = l.id), 0)::text AS "issuedQty"
    FROM app.purchase_request_line l
    JOIN app.purchase_request pr ON pr.id = l.pr_id
    WHERE l.item_id = ANY(${uuidArray(itemIds)})
      AND pr.id <> ${excludePrId}
      AND pr.status IN ('SUBMITTED', 'APPROVED', 'CONVERTED')
      AND pr.approval_step IN ('DEPT_APPROVED', 'DIRECTOR_APPROVED')
      AND pr.completed_at IS NULL
      AND pr.goods_issued_at IS NULL
  `)) as unknown as Array<{
    itemId: string;
    qty: string;
    approvedQty: string | null;
    issuedQty: string;
  }>;
  return computeCommittedByItem(rows);
}

/**
 * Dòng PR + tồn khả dụng HIỆN TẠI của vật tư (app.v_item_stock.issuable_qty:
 * AVAILABLE, trừ giữ chỗ, không tính HOLD) TRỪ phần đã giữ chỗ mềm cho phiếu khác (L1).
 * `issuedByLine` (Kiểm tồn lại): dòng chỉ còn "qty − đã xuất" cần được đáp ứng.
 */
export async function getPrStockCheck(
  prId: string,
  exec: Executor & Pick<typeof db, "select"> = db,
  issuedByLine?: ReadonlyMap<string, number>,
) {
  const lines = await getPRLinesEnriched(prId, exec);
  const itemIds = Array.from(new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x)));
  const issuable = await getIssuableQtyByItem(itemIds, exec);
  const committed = await getCommittedByItem(itemIds, prId, exec);
  const avail = netIssuableByItem(issuable, committed);
  const eff = (l: (typeof lines)[number]) =>
    Math.max(0, (Number(l.qty) || 0) - (issuedByLine?.get(l.id) ?? 0));
  // C4 — phân bổ tồn LŨY KẾ theo vật tư (dòng trước dùng trước): hai dòng cùng
  // vật tư không còn cùng "thấy" toàn bộ tồn.
  const alloc = allocateStockAcrossLines(
    lines.map((l) => ({ id: l.id, itemId: l.itemId, qty: eff(l) })),
    avail,
  );
  return lines.map((l) => ({
    id: l.id,
    lineNo: l.lineNo,
    itemId: l.itemId,
    sku: l.sku,
    name: l.name,
    uom: l.uom ?? l.itemUom,
    /** SL cần đáp ứng (đề xuất; khi Kiểm tồn lại = đề xuất − đã xuất). */
    qty: eff(l),
    qtyTotal: Number(l.qty) || 0,
    issuedQty: issuedByLine?.get(l.id) ?? 0,
    /** SL cần mua đang chốt (null = chưa chốt). */
    approvedQty: l.approvedQty != null ? Number(l.approvedQty) : null,
    /** Tồn còn lại cho RIÊNG dòng này sau khi các dòng trước (cùng vật tư) đã dùng. */
    available: alloc.get(l.id) ?? 0,
    /** Tồn khả dụng của vật tư SAU khi trừ phần giữ chỗ cho phiếu khác (chưa trừ các dòng trước). */
    stockTotal: l.itemId ? avail.get(l.itemId) ?? 0 : 0,
    /** Phần đang giữ chỗ cho phiếu khác. */
    reservedByOthers: l.itemId ? committed.get(l.itemId) ?? 0 : 0,
    /** Tồn khả dụng thô của vật tư (chưa trừ giữ chỗ phiếu khác). */
    stockRaw: l.itemId ? issuable.get(l.itemId) ?? 0 : 0,
  }));
}

/** C4 — kiểm tổng phần xuất từ kho theo vật tư ≤ tồn khả dụng hiện tại. Trả thông báo lỗi hoặc null. */
export function checkStockCommitment(
  stock: Awaited<ReturnType<typeof getPrStockCheck>>,
  decisions: Readonly<Record<string, number>>,
): string | null {
  const stockByItem = new Map<string, number>();
  for (const l of stock) if (l.itemId) stockByItem.set(l.itemId, l.stockTotal);
  return validateStockCommitment(
    stock.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      qty: l.qty,
      label: l.sku ?? l.name ?? `dòng ${l.lineNo}`,
    })),
    decisions,
    stockByItem,
  );
}

/** C1/T2 — tình hình PO sống của phiếu: đã nhận đạt / đã "hết chờ" theo vật tư. */
export async function getPrPoSummary(prId: string, exec: Executor = db): Promise<PrPoSummary> {
  const rows = (await exec.execute(sql`
    SELECT pol.item_id::text AS item_id, po.status AS status,
           pol.ordered_qty::text AS ordered,
           pol.received_qty::text AS received,
           COALESCE((
             SELECT SUM(rl.received_qty)
             FROM app.inbound_receipt_line rl
             WHERE rl.po_line_id = pol.id AND rl.qc_status = 'FAIL'
           ), 0)::text AS rejected
    FROM app.purchase_order_line pol
    JOIN app.purchase_order po ON po.id = pol.po_id
    WHERE po.pr_id = ${prId} AND po.status <> 'CANCELLED'
  `)) as unknown as Array<{
    item_id: string;
    status: string;
    ordered: string;
    received: string;
    rejected: string;
  }>;
  const received = new Map<string, number>();
  const settled = new Map<string, number>();
  const pending = new Map<string, number>();
  for (const r of rows) {
    const got = Math.max(0, (Number(r.received) || 0) - (Number(r.rejected) || 0));
    received.set(r.item_id, (received.get(r.item_id) ?? 0) + got);
    // PO đã đóng: phần NCC không giao nữa coi là "hết chờ".
    const done = r.status === "CLOSED" ? Math.max(got, Number(r.ordered) || 0) : got;
    settled.set(r.item_id, (settled.get(r.item_id) ?? 0) + done);
    // L3 — còn chờ về: PO đã đóng thì không chờ nữa.
    const wait = r.status === "CLOSED" ? 0 : Math.max(0, (Number(r.ordered) || 0) - got);
    pending.set(r.item_id, (pending.get(r.item_id) ?? 0) + wait);
  }
  return {
    hasLivePo: rows.length > 0,
    receivedByItem: received,
    settledByItem: settled,
    pendingByItem: pending,
  };
}

/**
 * Trạng thái xuất kho đầy đủ của phiếu (C3/T2): trần xuất từng dòng + còn phần
 * cần mua chưa về. `stage` suy từ trạng thái phiếu.
 */
export async function getPrIssueContext(
  prId: string,
  lines: Array<{
    id: string;
    itemId: string | null;
    qty: number | string;
    approvedQty?: number | string | null;
  }>,
  issuedByLine: ReadonlyMap<string, number>,
  stage: "WAREHOUSE" | "FINAL",
  exec: Executor = db,
) {
  const po = await getPrPoSummary(prId, exec);
  return buildIssueContext(
    stage,
    lines.map((l) => ({ ...l, issuedQty: issuedByLine.get(l.id) ?? 0 })),
    po,
  );
}

export async function getIssuableQtyByItem(
  itemIds: string[],
  exec: Executor = db,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (itemIds.length === 0) return out;
  const rows = (await exec.execute(sql`
    SELECT item_id::text AS item_id, issuable_qty::text AS qty
    FROM app.v_item_stock
    WHERE item_id = ANY(${uuidArray(itemIds)})
  `)) as unknown as Array<{ item_id: string; qty: string }>;
  for (const r of rows) out.set(r.item_id, Number(r.qty) || 0);
  return out;
}

/**
 * V3.7.69 YCVT — Step 3: Giám đốc/Mua hàng duyệt.
 * DEPT_APPROVED → DIRECTOR_APPROVED. Đồng thời set status = APPROVED để chuyển
 * sang flow tạo PO existing (giữ backwards-compat với module purchase-orders).
 */
export async function directorApprovePR(
  id: string,
  approverId: string,
  note?: string | null,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({
      status: "APPROVED",
      approvalStep: "DIRECTOR_APPROVED",
      directorApprovedBy: approverId,
      directorApprovedAt: new Date(),
      directorApprovalNote: note ?? null,
      approvedBy: approverId, // back-compat (= director step)
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseRequest.id, id),
        eq(purchaseRequest.approvalStep, "DEPT_APPROVED"),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * V3.9 — Admin duyệt nhanh: gộp 2 cấp trong 1 UPDATE atomic.
 * SUBMITTED → DIRECTOR_APPROVED + status APPROVED. Cả 2 ô ký = admin (QĐ-2).
 * `WHERE approvalStep='SUBMITTED'` → race với dept-approve trả null → caller 409.
 */
export async function quickApprovePR(
  id: string,
  approverId: string,
  note?: string | null,
  buyQtys?: Record<string, number>,
): Promise<
  | (PurchaseRequest & {
      decisions: Record<string, number>;
      summary: ReturnType<typeof summarizeBuyDecisions>;
    })
  | null
> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const quickNote = note ?? "Duyệt nhanh (Admin)";
    await lockPrItemsForStock(tx, id);
    const decisions = await resolveAndCheckDecisions(tx, id, buyQtys);
    const summary = summarizeBuyDecisions(decisions);
    const [row] = await tx
      .update(purchaseRequest)
      .set({
        status: "APPROVED",
        approvalStep: "DIRECTOR_APPROVED",
        deptApprovedBy: approverId,
        deptApprovedAt: now,
        deptApprovalNote: quickNote,
        directorApprovedBy: approverId,
        directorApprovedAt: now,
        directorApprovalNote: quickNote,
        approvedBy: approverId, // back-compat
        approvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(purchaseRequest.id, id),
          eq(purchaseRequest.approvalStep, "SUBMITTED"),
        ),
      )
      .returning();
    if (!row) return null;
    await writeBuyDecisions(tx, id, decisions);
    return Object.assign(row, { decisions, summary });
  });
}

/**
 * L1 — "Kiểm tồn lại" (Kho/admin): phiếu đã qua Kho duyệt, chưa hoàn tất, chưa có PO
 * sống → tính lại SL cần mua theo tồn khả dụng hiện tại (sau giữ chỗ phiếu khác;
 * Kho có thể chỉnh qua `buyQtys`). Có dòng phải mua THÊM → ghi approved_qty mới và
 * đưa phiếu về chờ duyệt cuối (SUBMITTED/DEPT_APPROVED). Không tăng → giữ nguyên.
 */
export async function recheckPrStock(
  id: string,
  actorId: string,
  buyQtys?: Record<string, number>,
): Promise<{
  pr: PurchaseRequest;
  increased: boolean;
  summary: ReturnType<typeof summarizeBuyDecisions>;
  decisions: Record<string, number>;
  prevStep: string | null;
}> {
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(purchaseRequest)
      .where(eq(purchaseRequest.id, id))
      .for("update")
      .limit(1);
    if (!cur) throw new PrApprovalError("INVALID_STATE", "Không tìm thấy phiếu.", 404);
    if (
      !isStockRecheckableState({
        status: cur.status,
        approvalStep: cur.approvalStep,
        completedAt: cur.completedAt,
        goodsIssuedAt: cur.goodsIssuedAt,
      })
    ) {
      throw new PrApprovalError(
        "INVALID_STATE",
        "Chỉ kiểm tồn lại được phiếu đã qua Kho duyệt và chưa hoàn tất.",
        409,
      );
    }
    const po = await getPrPoSummary(id, tx);
    if (po.hasLivePo) {
      throw new PrApprovalError(
        "INVALID_STATE",
        "Phiếu đã có PO — huỷ/đóng PO trước khi kiểm tồn lại.",
        409,
      );
    }
    await lockPrItemsForStock(tx, id);
    const issuedByLine = await getPRIssuedQtyByLine(id, tx);
    const stock = await getPrStockCheck(id, tx, issuedByLine);
    const resolved = resolveBuyDecisions(stock, buyQtys);
    if (!resolved.ok) throw new PrApprovalError("VALIDATION", resolved.message, 422);
    const over = checkStockCommitment(stock, resolved.decisions);
    if (over) throw new PrApprovalError("STOCK_SHORT", over, 422);

    // stock[].qty = phần còn phải đáp ứng (đề xuất − đã xuất); SL cần mua mới tính trên cùng cơ sở.
    const plan = planStockRecheck(
      stock.map((l) => ({ id: l.id, itemId: l.itemId, qty: l.qty, approvedQty: l.approvedQty })),
      resolved.decisions,
    );
    const summary = summarizeBuyDecisions(resolved.decisions);
    const prevStep = cur.approvalStep;
    if (!plan.increased) {
      return { pr: cur, increased: false, summary, decisions: resolved.decisions, prevStep };
    }
    await writeBuyDecisions(tx, id, resolved.decisions);
    const now = new Date();
    const [row] = await tx
      .update(purchaseRequest)
      .set({
        status: "SUBMITTED",
        approvalStep: "DEPT_APPROVED",
        deptApprovedBy: actorId,
        deptApprovedAt: now,
        deptApprovalNote: "Kho kiểm tồn lại: tồn không đủ, cần mua thêm",
        directorApprovedBy: null,
        directorApprovedAt: null,
        directorApprovalNote: null,
        approvedBy: null,
        approvedAt: null,
        updatedAt: now,
      })
      .where(and(eq(purchaseRequest.id, id), sql`${purchaseRequest.completedAt} IS NULL`))
      .returning();
    if (!row) throw new PrApprovalError("INVALID_STATE", "Phiếu đã thay đổi trạng thái.", 409);
    return { pr: row, increased: true, summary, decisions: resolved.decisions, prevStep };
  });
}

/**
 * V3.7.70 YCVT — Timeline IV.1: Auto-hook khi PO link với PR được duyệt
 * RECEIVED. Idempotent: chỉ set goods_received_at lần đầu.
 */
export async function markPRGoodsReceived(
  id: string,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({ goodsReceivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(purchaseRequest.id, id),
        sql`${purchaseRequest.goodsReceivedAt} IS NULL`,
      ),
    )
    .returning();
  return row ?? null;
}

/** THUẦN — mọi PO (đã loại CANCELLED) của PR đã nhận đủ/đóng? Không có PO nào → false. */
export function areAllPOsReceived(poStatuses: readonly string[]): boolean {
  const live = poStatuses.filter((s) => s !== "CANCELLED");
  return live.length > 0 && live.every((s) => s === "RECEIVED" || s === "CLOSED");
}

/**
 * L4 — chỉ đánh "Đã nhận hàng" của PR khi TẤT CẢ PO (không tính CANCELLED) đã
 * RECEIVED/CLOSED. PR tách N PO theo NCC: PO đầu nhận đủ chưa đủ để coi cả PR đã
 * nhận (trước đây gọi markPRGoodsReceived ngay khi 1 PO xong).
 */
export async function markPRGoodsReceivedIfAllPOsDone(
  prId: string,
): Promise<PurchaseRequest | null> {
  const pos = await db
    .select({ status: purchaseOrder.status })
    .from(purchaseOrder)
    .where(eq(purchaseOrder.prId, prId));
  if (!areAllPOsReceived(pos.map((p) => p.status as string))) return null;
  return markPRGoodsReceived(prId);
}

/**
 * V4.2 (TASK "Trừ tồn luôn") — Timeline IV.2: "Đã xuất kho" giờ TRỪ TỒN THẬT
 * trong cùng 1 thao tác, thay vì chỉ ghi mốc thời gian như trước (lỗi khiến
 * Kho phải xuất lại lần 2 ở Sơ đồ kho → tồn lệch).
 *
 * 2 thiết kế:
 *  - Đường thường: Kho chọn lô/bin cho từng dòng PR có itemId (gắn vật tư
 *    trong danh mục) → validatePrIssuePicks (thuần, cap = approvedQty ?? qty)
 *    → createGoodsIssueTx (Đợt 1b, TÁI DÙNG assertIssuable/postOutboundTxns/
 *    genDocNo — không có logic tồn mới) sinh 1 phiếu xuất PX gắn
 *    sourceType='PURCHASE_REQUEST'. Dòng không có itemId (nhập tay) không
 *    trừ tồn được nhưng không chặn các dòng khác.
 *  - Đường thoát hiểm: `noStockConfirm=true` + lý do ≥ 3 ký tự → ghi nhận đã
 *    xuất KHÔNG trừ tồn (vật tư mua ngoài giao thẳng, không qua kho) — giữ
 *    tương thích hành vi cũ, nhưng bắt buộc xác nhận rõ ràng + audit lý do.
 *
 * Idempotent: khoá PR FOR UPDATE trong transaction + WHERE goods_issued_at IS
 * NULL ở UPDATE cuối → bấm 2 lần (kể cả gần như đồng thời) chỉ 1 lần trừ tồn,
 * lần sau ném GoodsIssueError('ALREADY_ISSUED', 409). unique index
 * `goods_issue_pr_uk` (migration 0067) là lưới an toàn cuối ở DB.
 */
export interface PrIssueLineState {
  id: string;
  itemId: string | null;
  sku: string | null;
  /** SL đề xuất — dùng làm cap khi chưa có approvedQty. */
  qty: number;
  /** SL đã duyệt (Kho ghi ở bước 2) — cap ưu tiên khi có. */
  approvedQty: number | null;
  /** L8 — tổng đã xuất ở các đợt trước (mặc định 0). Cho phép xuất nhiều đợt. */
  issuedQty?: number;
  /** T2 — trần xuất đã tính sẵn (có PO sống); không có → tính theo giai đoạn. */
  cap?: number;
}

export interface PrIssuePickInput {
  prLineId: string;
  lotSerialId: string;
  binId: string;
  qty: number;
}

export interface PrIssuePickResolved {
  itemId: string;
  lotSerialId: string;
  binId: string;
  qty: number;
  purchaseRequestLineId: string;
}

export type ValidatePrIssueResult =
  | { ok: true; picks: PrIssuePickResolved[] }
  | { ok: false; error: GoodsIssueError };

/** Sai số khi so sánh SL (goods_issue_line.qty chỉ 4 số lẻ, PR line 6 số lẻ). */
const PR_ISSUE_EPS = 1e-4;

const fmtQ = (n: number) => Number(n.toFixed(4)).toLocaleString("vi-VN");

/**
 * THUẦN — kiểm picks xuất kho cho 1 PR (L8: xuất NHIỀU ĐỢT):
 *  - dòng phải thuộc PR (lấy từ `lines`, không tin client);
 *  - dòng chưa gắn vật tư trong danh mục (itemId null) → không trừ tồn được;
 *  - SL mỗi pick > 0; tổng pick mỗi dòng ≤ còn lại = cap (approvedQty ?? qty
 *    đề xuất) − đã xuất ở các đợt trước.
 */
export function validatePrIssuePicks(
  lines: PrIssueLineState[],
  picks: PrIssuePickInput[],
  /** WAREHOUSE = sau Kho duyệt, chưa duyệt cuối: trần = qty − SL cần mua. FINAL: trần = qty. */
  stage: "WAREHOUSE" | "FINAL" = "FINAL",
): ValidatePrIssueResult {
  const fail = (code: string, msg: string, status = 422): ValidatePrIssueResult => ({
    ok: false,
    error: new GoodsIssueError(code, msg, status),
  });

  if (picks.length === 0) {
    return fail("EMPTY_ISSUE", "Chưa chọn lô xuất cho dòng nào.", 400);
  }

  const byId = new Map(lines.map((l) => [l.id, l]));
  const qtyByLine = new Map<string, number>();
  const resolved: PrIssuePickResolved[] = [];

  for (const p of picks) {
    if (!Number.isFinite(p.qty) || p.qty <= 0) {
      return fail("INVALID_QTY", "Số lượng xuất phải lớn hơn 0.", 400);
    }
    const line = byId.get(p.prLineId);
    if (!line) {
      return fail(
        "LINE_NOT_IN_REQUEST",
        "Có dòng không thuộc phiếu này — vui lòng tải lại trang.",
        400,
      );
    }
    if (!line.itemId) {
      return fail(
        "LINE_NO_MASTER_ITEM",
        `${line.sku ?? `Dòng ${p.prLineId.slice(0, 8)}`} chưa gắn vật tư trong danh mục — không trừ tồn được cho dòng này (bỏ qua hoặc dùng "ghi nhận không trừ tồn").`,
      );
    }
    qtyByLine.set(line.id, (qtyByLine.get(line.id) ?? 0) + p.qty);
    resolved.push({
      itemId: line.itemId,
      lotSerialId: p.lotSerialId,
      binId: p.binId,
      qty: p.qty,
      purchaseRequestLineId: line.id,
    });
  }

  for (const [lineId, qty] of qtyByLine) {
    const line = byId.get(lineId)!;
    // approved_qty = SL CẦN MUA (Kho kiểm tồn) — trần xuất kho: xem issueCapForStage.
    const cap = line.cap ?? issueCapForStage(stage, line.qty, line.approvedQty);
    const issued = line.issuedQty ?? 0;
    const remaining = Math.max(0, cap - issued);
    if (qty > remaining + PR_ISSUE_EPS) {
      const label = line.sku ?? "Dòng";
      const capLabel =
        stage === "WAREHOUSE"
          ? "phần xuất từ kho"
          : line.cap !== undefined && line.cap + PR_ISSUE_EPS < Number(line.qty)
            ? "phần có sẵn + hàng đã về"
            : "SL đề xuất";
      if (issued > PR_ISSUE_EPS) {
        return fail(
          "OVER_ISSUE",
          remaining <= PR_ISSUE_EPS
            ? `${label} đã xuất đủ ${fmtQ(cap)} (${capLabel}) — không xuất thêm.`
            : `${label} chỉ còn được xuất tối đa ${fmtQ(remaining)} (${capLabel} ${fmtQ(cap)}, đã xuất ${fmtQ(issued)}), không xuất ${fmtQ(qty)}.`,
        );
      }
      return fail(
        "OVER_ISSUE",
        `${label} chỉ được xuất tối đa ${fmtQ(cap)} (${capLabel}), không xuất ${fmtQ(qty)}.`,
      );
    }
  }

  return { ok: true, picks: resolved };
}

export interface PrIssueProgress {
  /** true khi MỌI dòng có vật tư trong danh mục đã xuất đủ (và có ít nhất 1 dòng như vậy). */
  complete: boolean;
  /** Số dòng còn thiếu. */
  pendingLines: number;
  /** Còn dòng CẦN MUA chưa có PO / hàng chưa về. */
  outstandingBuy?: boolean;
  /** SL còn xuất được ở giai đoạn hiện tại (chỉ dòng có vật tư) — 0 nghĩa là Kho hết việc xuất. */
  issuableRemaining?: number;
  lines: { id: string; cap: number; issued: number; remaining: number }[];
}

/**
 * THUẦN (L8/C3) — tiến độ xuất kho của PR. HOÀN TẤT khi MỌI dòng (kể cả dòng nhập
 * tay chưa gắn vật tư — chưa xuất được nên chưa đủ) đã xuất đủ trần VÀ không còn
 * phần cần mua chưa có PO / hàng chưa về (`outstandingBuy`).
 */
export function computePrIssueProgress(
  lines: PrIssueLineState[],
  stage: "WAREHOUSE" | "FINAL" = "FINAL",
  outstandingBuy = false,
): PrIssueProgress {
  const out = lines.map((l) => {
    const cap = l.cap ?? issueCapForStage(stage, l.qty, l.approvedQty);
    const issued = l.issuedQty ?? 0;
    return { id: l.id, cap, issued, remaining: Math.max(0, cap - issued) };
  });
  // Dòng chưa gắn vật tư không xuất được → luôn "còn thiếu" cho tới khi PO gắn vật tư.
  const pending = lines.filter((l, i) => !l.itemId || out[i]!.remaining > PR_ISSUE_EPS).length;
  return {
    complete: lines.length > 0 && pending === 0 && !outstandingBuy,
    pendingLines: pending,
    outstandingBuy,
    issuableRemaining:
      Math.round(
        lines.reduce((a, l, i) => a + (l.itemId ? out[i]!.remaining : 0), 0) * 1e6,
      ) / 1e6,
    lines: out,
  };
}

export interface MarkPRIssuedInput {
  actorUserId: string;
  picks: PrIssuePickInput[];
  /** Ghi nhận đã xuất KHÔNG trừ tồn (vật tư mua ngoài giao thẳng) — kết thúc luôn. */
  noStockConfirm?: boolean;
  /** Bắt buộc ≥ 3 ký tự khi noStockConfirm=true. */
  noStockReason?: string | null;
  notes?: string | null;
  /**
   * L8 — "Kết thúc, không xuất thêm": đóng quy trình xuất kho dù còn dòng chưa xuất
   * đủ. Có thể kèm picks (xuất đợt cuối rồi đóng) hoặc không (cần ≥ 1 đợt trước đó).
   */
  finish?: boolean;
}

export interface MarkPRIssuedResult {
  pr: PurchaseRequest;
  goodsIssue: CreatedGoodsIssue | null;
  /** true = phiếu đã xuất đủ/kết thúc (goods_issued_at + hoàn tất); false = còn đợt sau. */
  complete: boolean;
  progress: PrIssueProgress | null;
}

export async function markPRGoodsIssuedWithStock(
  id: string,
  input: MarkPRIssuedInput,
): Promise<MarkPRIssuedResult> {
  return db.transaction(async (tx) => {
    // Khoá PR TRƯỚC — 2 lượt bấm gần như đồng thời xếp hàng tại đây, lượt sau
    // thấy goods_issued_at đã set → ALREADY_ISSUED (không trừ tồn 2 lần).
    const [current] = await tx
      .select()
      .from(purchaseRequest)
      .where(eq(purchaseRequest.id, id))
      .for("update")
      .limit(1);
    if (!current) {
      throw new GoodsIssueError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
    }
    // Giai đoạn Kho: đã qua Kho duyệt (DEPT_APPROVED), chưa duyệt cuối → Kho được
    // xuất phần có sẵn trong kho (qty − SL cần mua), KHÔNG hoàn tất phiếu.
    const stage: "WAREHOUSE" | "FINAL" = isWarehouseIssueStage(current) ? "WAREHOUSE" : "FINAL";
    if (stage === "FINAL" && current.status !== "APPROVED" && current.status !== "CONVERTED") {
      throw new GoodsIssueError(
        "INVALID_STATE",
        "Phiếu chưa được duyệt xong — chưa ghi nhận xuất kho được.",
        409,
      );
    }
    if (stage === "WAREHOUSE" && (input.noStockConfirm || input.finish)) {
      throw new GoodsIssueError(
        "INVALID_STATE",
        "Phiếu còn chờ duyệt mua — chỉ xuất phần có sẵn trong kho được, chưa kết thúc/ghi nhận không trừ tồn.",
        409,
      );
    }
    if (current.goodsIssuedAt) {
      throw new GoodsIssueError(
        "ALREADY_ISSUED",
        "Phiếu đã xuất kho xong — không xuất thêm.",
        409,
      );
    }

    let createdGoodsIssue: CreatedGoodsIssue | null = null;
    let complete = false;
    let progress: PrIssueProgress | null = null;

    const lineRows = await tx
      .select({
        id: purchaseRequestLine.id,
        itemId: purchaseRequestLine.itemId,
        qty: purchaseRequestLine.qty,
        approvedQty: purchaseRequestLine.approvedQty,
        masterSku: item.sku,
        itemSku: purchaseRequestLine.itemSku,
      })
      .from(purchaseRequestLine)
      .leftJoin(item, eq(item.id, purchaseRequestLine.itemId))
      .where(eq(purchaseRequestLine.prId, id));

    // L8 — tổng đã xuất theo dòng ở các đợt trước (goods_issue_line).
    const issuedRows = await tx
      .select({
        lineId: goodsIssueLine.purchaseRequestLineId,
        qty: sql<string>`COALESCE(SUM(${goodsIssueLine.qty}), 0)`,
      })
      .from(goodsIssueLine)
      .innerJoin(goodsIssue, eq(goodsIssue.id, goodsIssueLine.goodsIssueId))
      .where(eq(goodsIssue.purchaseRequestId, id))
      .groupBy(goodsIssueLine.purchaseRequestLineId);
    const issuedByLine = new Map<string, number>();
    for (const r of issuedRows) {
      if (r.lineId) issuedByLine.set(r.lineId, Number(r.qty) || 0);
    }
    const hadEarlierIssue = issuedRows.length > 0;

    // T2 — có PO sống: trần = (đề xuất − cần mua) + đã nhận; C3 — cờ còn phần cần mua chưa về.
    const poSummary = await getPrPoSummary(id, tx);
    const ctxOf = (issued: ReadonlyMap<string, number>) =>
      buildIssueContext(
        stage,
        lineRows.map((l) => ({
          id: l.id,
          itemId: l.itemId,
          qty: Number(l.qty) || 0,
          approvedQty: l.approvedQty != null ? Number(l.approvedQty) : null,
          issuedQty: issued.get(l.id) ?? 0,
        })),
        poSummary,
      );
    const ctxBefore = ctxOf(issuedByLine);


    if (input.noStockConfirm) {
      const reason = (input.noStockReason ?? "").trim();
      if (reason.length < 3) {
        throw new GoodsIssueError(
          "NO_STOCK_REASON_REQUIRED",
          "Cần nhập lý do (tối thiểu 3 ký tự) khi ghi nhận đã xuất không trừ tồn.",
          422,
        );
      }
      // L4 — "không trừ tồn" cũng không được lách chặn còn phần mua chưa về.
      if (ctxBefore.outstandingBuy) {
        throw new GoodsIssueError(
          "OUTSTANDING_PURCHASE",
          "Còn PO chưa về — huỷ/đóng PO trước khi ghi nhận.",
          409,
        );
      }
      complete = true;
    } else {
      const lineStates: PrIssueLineState[] = lineRows.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        sku: l.masterSku ?? l.itemSku ?? null,
        qty: Number(l.qty) || 0,
        approvedQty: l.approvedQty != null ? Number(l.approvedQty) : null,
        issuedQty: issuedByLine.get(l.id) ?? 0,
        cap: ctxBefore.caps.get(l.id),
      }));
      const outstandingMsg =
        "Còn phần CẦN MUA chưa có PO hoặc hàng chưa về đủ — chưa kết thúc/hoàn tất được. Chờ hàng về (hoặc Thu mua đóng PO) rồi xuất tiếp.";

      if (input.picks.length === 0) {
        // Chỉ hợp lệ khi "Kết thúc, không xuất thêm" sau ≥ 1 đợt đã xuất.
        if (!input.finish) {
          throw new GoodsIssueError("EMPTY_ISSUE", "Chưa chọn lô xuất cho dòng nào.", 400);
        }
        if (!hadEarlierIssue) {
          throw new GoodsIssueError(
            "EMPTY_ISSUE",
            "Chưa xuất đợt nào — chọn lô để xuất trước khi kết thúc.",
            422,
          );
        }
        if (ctxBefore.outstandingBuy) {
          throw new GoodsIssueError("OUTSTANDING_PURCHASE", outstandingMsg, 409);
        }
        progress = computePrIssueProgress(lineStates, stage, false);
        complete = true;
      } else {
        const v = validatePrIssuePicks(lineStates, input.picks, stage);
        if (!v.ok) throw v.error;

        // Tính trước tiến độ SAU đợt này để chặn "Kết thúc" khi còn phần cần mua chưa về.
        const issuedAfter = new Map(issuedByLine);
        for (const p of v.picks) {
          issuedAfter.set(
            p.purchaseRequestLineId,
            (issuedAfter.get(p.purchaseRequestLineId) ?? 0) + p.qty,
          );
        }
        const ctxAfter = ctxOf(issuedAfter);
        if (input.finish && ctxAfter.outstandingBuy) {
          throw new GoodsIssueError("OUTSTANDING_PURCHASE", outstandingMsg, 409);
        }

        createdGoodsIssue = await createGoodsIssueTx(tx, {
          sourceType: "PURCHASE_REQUEST",
          reason: "manual",
          purchaseRequestId: id,
          reference: current.paperFormNo ?? current.code,
          notes: input.notes ?? null,
          issuedBy: input.actorUserId,
          receivedBy: current.requestedBy,
          picks: v.picks.map((p) => ({
            itemId: p.itemId,
            lotSerialId: p.lotSerialId,
            binId: p.binId,
            qty: p.qty,
            purchaseRequestLineId: p.purchaseRequestLineId,
          })),
        });

        // Tính lại tiến độ SAU đợt này (trần dùng lại — hàng về không đổi trong giao dịch).
        const afterStates = lineStates.map((l) => ({
          ...l,
          issuedQty: issuedAfter.get(l.id) ?? 0,
          cap: ctxAfter.caps.get(l.id),
        }));
        progress = computePrIssueProgress(afterStates, stage, ctxAfter.outstandingBuy);
        // Giai đoạn Kho không bao giờ hoàn tất (còn phần cần mua chờ duyệt cuối).
        complete = stage === "FINAL" && (!!input.finish || progress.complete);
      }
    }

    const now = new Date();
    if (!complete) {
      // Còn đợt sau — chỉ chạm updatedAt, chưa đặt mốc "Đã xuất kho".
      const [row] = await tx
        .update(purchaseRequest)
        .set({ updatedAt: now })
        .where(eq(purchaseRequest.id, id))
        .returning();
      return { pr: row ?? current, goodsIssue: createdGoodsIssue, complete: false, progress };
    }

    const [row] = await tx
      .update(purchaseRequest)
      .set({
        goodsIssuedAt: now,
        // L8 — xuất đủ/kết thúc = hoàn tất (hiển thị "Hoàn tất", không phải "Đã duyệt").
        completedAt: current.completedAt ?? now,
        approvalStep: "DONE",
        updatedAt: now,
        // A18 — ghi chú hệ thống ("không trừ tồn: lý do", "kết thúc xuất kho…") KHÔNG
        // nối vào notes người dùng nữa: đã nằm trong audit log (mark-issued route).
      })
      .where(
        and(eq(purchaseRequest.id, id), sql`${purchaseRequest.goodsIssuedAt} IS NULL`),
      )
      .returning();
    if (!row) {
      // Race lý thuyết: lượt khác vừa commit giữa lúc khoá được nhả (không thể
      // xảy ra trong cùng transaction đã FOR UPDATE, giữ để an toàn tuyệt đối).
      throw new GoodsIssueError(
        "ALREADY_ISSUED",
        "Phiếu đã xuất kho xong — không xuất thêm.",
        409,
      );
    }

    return { pr: row, goodsIssue: createdGoodsIssue, complete: true, progress };
  });
}

/**
 * V3.7.70 YCVT — Timeline IV.3: Manual mark "Hoàn tất" bởi admin.
 * Idempotent qua WHERE completedAt IS NULL. Đồng thời set approval_step = DONE.
 */
export async function markPRCompleted(
  id: string,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({
      completedAt: new Date(),
      approvalStep: "DONE",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseRequest.id, id),
        sql`${purchaseRequest.completedAt} IS NULL`,
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * V3.7.71 YCVT — Hard-delete PR (admin only).
 *
 * Guard:
 *   - Nếu có PO link → throw "PR_HAS_POS" (admin phải gọi với force=true để
 *     null-out po.pr_id trước).
 *   - Lines tự cascade qua FK onDelete: cascade.
 *
 * Trả về true nếu xoá thành công, throw nếu fail.
 */
export async function deletePR(
  id: string,
  options: { force?: boolean } = {},
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // A3 — đã có phiếu xuất kho → chặn (FK goods_issue_purchase_request_id_fkey).
    const issues = await tx
      .select({ issueNo: goodsIssue.issueNo })
      .from(goodsIssue)
      .where(eq(goodsIssue.purchaseRequestId, id));
    if (issues.length > 0) {
      throw new Error(
        `PR_HAS_GOODS_ISSUE: ${prHasGoodsIssueMessage(issues.map((i) => i.issueNo), "delete")}`,
      );
    }
    // Check PO link
    const linkedPOs = await tx.execute(sql`
      SELECT id, po_no FROM app.purchase_order WHERE pr_id = ${id}
    `);
    const linkedRows = linkedPOs as unknown as Array<{
      id: string;
      po_no: string;
    }>;

    if (linkedRows.length > 0) {
      if (!options.force) {
        const list = linkedRows.map((r) => r.po_no).join(", ");
        throw new Error(`PR_HAS_POS: ${linkedRows.length} PO (${list})`);
      }
      // Force: null-out po.pr_id để không vi phạm FK
      await tx.execute(sql`
        UPDATE app.purchase_order SET pr_id = NULL WHERE pr_id = ${id}
      `);
    }

    // Lines cascade automatically via onDelete CASCADE
    const result = await tx
      .delete(purchaseRequest)
      .where(eq(purchaseRequest.id, id));
    // postgres-js trả rowCount qua result.count
    const count = (result as unknown as { count?: number }).count ?? 0;
    if (count === 0) throw new Error("PR_NOT_FOUND");
    return true;
  });
}

/**
 * Reject PR đang chờ duyệt → REJECTED. Guard approval_step ngay trong UPDATE để
 * tránh race với thao tác duyệt.
 *
 * C2 — nếu phiếu ĐÃ CÓ phiếu xuất kho (Kho xuất phần có sẵn trước duyệt cuối) mà
 * người duyệt cuối từ chối: KHÔNG chuyển REJECTED (tồn đã trừ, vật tư đã giao) —
 * chốt phiếu ở phần đã xuất: hoàn tất (completed_at + goods_issued_at), lưu lý do
 * từ chối, không lập PO được. `closedAtIssued = true` để route báo đúng nội dung.
 */
export async function rejectPR(
  id: string,
  userId: string | null,
  reason: string | null | undefined,
  /** N7 — bước người từ chối THẤY khi bấm; phiếu đã đổi bước giữa chừng → null (route trả 409). */
  expectedStep: "SUBMITTED" | "DEPT_APPROVED",
): Promise<(PurchaseRequest & { closedAtIssued: boolean }) | null> {
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(purchaseRequest)
      .where(eq(purchaseRequest.id, id))
      .for("update")
      .limit(1);
    if (!cur) return null;
    if (!isRejectStepCurrent(cur.approvalStep, expectedStep)) return null;

    const issues = await tx
      .select({ id: goodsIssue.id })
      .from(goodsIssue)
      .where(eq(goodsIssue.purchaseRequestId, id));
    const now = new Date();

    if (rejectOutcome(issues.length) === "CLOSE_AT_ISSUED") {
      const [row] = await tx
        .update(purchaseRequest)
        .set({
          // Giữ status hợp lệ "đã duyệt" để không hiện như phiếu bị từ chối; nhãn hiển thị
          // "Hoàn tất – phần mua bị từ chối" suy từ rejected_at + completed_at.
          status: "APPROVED",
          approvalStep: "DONE",
          rejectedBy: userId,
          rejectedAt: now,
          rejectionReason: reason ?? null,
          goodsIssuedAt: cur.goodsIssuedAt ?? now,
          completedAt: cur.completedAt ?? now,
          updatedAt: now,
        })
        .where(eq(purchaseRequest.id, id))
        .returning();
      return row ? Object.assign(row, { closedAtIssued: true }) : null;
    }

    const [row] = await tx
      .update(purchaseRequest)
      .set({
        status: "REJECTED",
        approvalStep: "REJECTED",
        rejectedBy: userId,
        rejectedAt: now,
        rejectionReason: reason ?? null,
        // A18 — lý do nằm ở rejection_reason + audit, KHÔNG nối vào ghi chú người dùng.
        updatedAt: now,
      })
      .where(eq(purchaseRequest.id, id))
      .returning();
    return row ? Object.assign(row, { closedAtIssued: false }) : null;
  });
}

/** THUẦN — thông báo đúng lý do khi phiếu ở trạng thái không huỷ được (L6). */
export function cancelBlockedMessage(status: string): string {
  switch (status) {
    case "REJECTED":
      return 'Phiếu đã bị từ chối nên không cần huỷ — dùng "Tạo lại từ phiếu này" nếu muốn đề xuất lại.';
    case "CANCELLED":
      return "Phiếu đã huỷ trước đó.";
    case "CONVERTED":
      return "Phiếu đã chuyển thành Đơn hàng mua — dùng Huỷ/Đóng PO thay thế.";
    default:
      return `Phiếu đang ở trạng thái ${status} — không thể huỷ.`;
  }
}

/** V4.4 (Việc 4) — Huỷ phiếu (khác reject: người tạo/admin tự huỷ). */
export class PrCancelError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "PrCancelError";
  }
}

/**
 * Huỷ PR — cho phép khi DRAFT/SUBMITTED (người tạo hoặc admin) hoặc APPROVED
 * mà CHƯA có PO nào (chỉ admin — kiểm tra route). Repo chỉ enforce state
 * machine + guard "đã có PO" bằng transaction (route enforce quyền theo
 * người tạo/role, xem `purchase-requests/[id]/cancel/route.ts`).
 */
export async function cancelPR(
  id: string,
  userId: string | null,
  reason: string,
): Promise<PurchaseRequest> {
  return db.transaction(async (tx) => {
    const [pr] = await tx
      .select()
      .from(purchaseRequest)
      .where(eq(purchaseRequest.id, id))
      .for("update")
      .limit(1);
    if (!pr) throw new PrCancelError("NOT_FOUND", "Không tìm thấy PR.", 404);

    const cancellableStatuses: PurchaseRequestStatus[] = ["DRAFT", "SUBMITTED", "APPROVED"];
    if (!cancellableStatuses.includes(pr.status)) {
      throw new PrCancelError("INVALID_STATE", cancelBlockedMessage(pr.status));
    }

    // A3 — đã có phiếu xuất kho (tồn đã trừ) → không huỷ.
    const issues = await tx
      .select({ issueNo: goodsIssue.issueNo })
      .from(goodsIssue)
      .where(eq(goodsIssue.purchaseRequestId, id));
    if (issues.length > 0) {
      throw new PrCancelError(
        "HAS_GOODS_ISSUE",
        prHasGoodsIssueMessage(issues.map((i) => i.issueNo), "cancel"),
      );
    }

    if (pr.status === "APPROVED") {
      const [po] = await tx
        .select({ id: purchaseOrder.id, poNo: purchaseOrder.poNo })
        .from(purchaseOrder)
        .where(eq(purchaseOrder.prId, id))
        .limit(1);
      if (po) {
        throw new PrCancelError(
          "HAS_PO",
          `Phiếu đã có Đơn hàng mua ${po.poNo} — không thể huỷ, dùng Huỷ/Đóng PO thay thế.`,
        );
      }
    }

    const [row] = await tx
      .update(purchaseRequest)
      .set({
        status: "CANCELLED",
        approvalStep: "CANCELLED",
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancellationReason: reason,
        // A18 — lý do nằm ở cancellation_reason + audit, KHÔNG nối vào ghi chú người dùng.
        updatedAt: new Date(),
      })
      .where(
        and(eq(purchaseRequest.id, id), inArray(purchaseRequest.status, cancellableStatuses)),
      )
      .returning();
    if (!row) throw new PrCancelError("CONFLICT", "Phiếu đã thay đổi trạng thái.");
    return row;
  });
}

/** L8 — tổng đã xuất theo từng dòng PR (cộng mọi đợt xuất). */
export async function getPRIssuedQtyByLine(
  prId: string,
  exec: Pick<typeof db, "select"> = db,
): Promise<Map<string, number>> {
  const rows = await exec
    .select({
      lineId: goodsIssueLine.purchaseRequestLineId,
      qty: sql<string>`COALESCE(SUM(${goodsIssueLine.qty}), 0)`,
    })
    .from(goodsIssueLine)
    .innerJoin(goodsIssue, eq(goodsIssue.id, goodsIssueLine.goodsIssueId))
    .where(eq(goodsIssue.purchaseRequestId, prId))
    .groupBy(goodsIssueLine.purchaseRequestLineId);
  const out = new Map<string, number>();
  for (const r of rows) if (r.lineId) out.set(r.lineId, Number(r.qty) || 0);
  return out;
}

export interface DuplicatePRResult {
  pr: PurchaseRequest;
  /** Số dòng đã chép sang bản nháp mới. */
  copiedLines: number;
  /** Các dòng bị bỏ vì vật tư đã vô hiệu hoá / không còn (để báo lại cho người dùng). */
  skippedLines: { lineNo: number; label: string }[];
  /** C2 — dòng bị bỏ vì Kho đã xuất đủ (SL còn lại = 0). */
  issuedFullLines: { lineNo: number; label: string }[];
  /** C2 — dòng giảm SL do đã xuất một phần: đề xuất cũ → SL mới. */
  reducedLines: { lineNo: number; label: string; from: number; to: number }[];
}

/**
 * L6 — "Tạo lại từ phiếu này": sao chép header + dòng của phiếu REJECTED/CANCELLED
 * thành 1 phiếu DRAFT mới của `requestedBy`. Dòng gắn vật tư đã vô hiệu hoá bị bỏ
 * và trả trong `skippedLines`. Không chép các mốc duyệt/xuất kho.
 */
export async function duplicatePRAsDraft(
  sourceId: string,
  requestedBy: string,
): Promise<DuplicatePRResult> {
  const src = await getPR(sourceId);
  if (!src) throw new PrValidationError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  const lines = await getPRLinesEnriched(sourceId);
  const itemIds = Array.from(
    new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x)),
  );
  const usable = new Set<string>();
  if (itemIds.length > 0) {
    const found = await db
      .select({ id: item.id, status: item.status, isActive: item.isActive })
      .from(item)
      .where(inArray(item.id, itemIds));
    for (const f of found) if (isItemUsableForPR(f)) usable.add(f.id);
  }
  const keep: typeof lines = [];
  const skipped: DuplicatePRResult["skippedLines"] = [];
  for (const l of lines) {
    if (l.itemId && !usable.has(l.itemId)) {
      skipped.push({ lineNo: l.lineNo, label: l.sku ?? l.name ?? `Dòng ${l.lineNo}` });
    } else {
      keep.push(l);
    }
  }
  // C2 — chép SL = đề xuất − đã xuất; dòng đã xuất đủ (= 0) bỏ.
  const issuedByLine = await getPRIssuedQtyByLine(sourceId);
  const rq = recreateQuantities(keep, issuedByLine);
  const qtyOf = new Map(rq.kept.map((k) => [k.line.id, k.qty]));
  const issuedFull = rq.dropped.map((l) => ({
    lineNo: l.lineNo,
    label: l.sku ?? l.name ?? `Dòng ${l.lineNo}`,
  }));
  const reduced = rq.kept
    .filter((k) => k.qty + 1e-9 < Number(k.line.qty))
    .map((k) => ({
      lineNo: k.line.lineNo,
      label: k.line.sku ?? k.line.name ?? `Dòng ${k.line.lineNo}`,
      from: Number(k.line.qty),
      to: k.qty,
    }));
  keep.splice(0, keep.length, ...rq.kept.map((k) => k.line));
  if (keep.length === 0) {
    if (issuedFull.length > 0 && skipped.length === 0) {
      throw new PrValidationError(
        "NOTHING_LEFT",
        "Kho đã xuất đủ mọi dòng của phiếu này — không còn gì để đề xuất lại.",
      );
    }
    throw new PrValidationError(
      "NO_USABLE_LINES",
      "Mọi vật tư trong phiếu này đã bị vô hiệu hoá — không tạo lại được.",
    );
  }
  const num = (v: string | null) => (v != null ? Number(v) : null);
  const pr = await createPR({
    title: src.title,
    source: "MANUAL",
    linkedOrderId: src.linkedOrderId,
    linkedWoId: src.linkedWoId,
    requestedBy,
    notes: src.notes ? src.notes.replace(/\n?\[(REJECTED|CANCELLED)[^\]]*\]/g, "").trim() || null : null,
    targetDepartment: src.targetDepartment,
    proposingDepartment: src.proposingDepartment,
    requestReason: src.requestReason,
    formType: (src.formType as "MRF" | "DNVT" | null) ?? "MRF",
    lines: keep.map((l) => ({
      itemId: l.itemId,
      itemName: l.itemName,
      itemSku: l.itemSku,
      qty: qtyOf.get(l.id) ?? Number(l.qty),
      preferredSupplierId: l.preferredSupplierId,
      neededBy: null,
      notes: l.notes,
      specification: l.specification,
      uom: l.uom,
      priority: (l.priority as "URGENT" | "NORMAL" | "RESERVE" | null) ?? null,
      category: (l.category as "TOOL" | "CONSUMABLE" | "MATERIAL" | "OTHER" | null) ?? null,
      estimatedUnitPrice: num(l.estimatedUnitPrice),
      referenceCode: l.referenceCode,
      onHandSnapshot: num(l.onHandSnapshot),
      referenceNote: l.referenceNote,
      deliveryDate: null,
    })),
  });
  return {
    pr,
    copiedLines: keep.length,
    skippedLines: skipped,
    issuedFullLines: issuedFull,
    reducedLines: reduced,
  };
}

/**
 * Enrichment helper: join PR line với item master.
 * V3.7.72 — LEFT JOIN item (vì itemId nullable). Fallback hiển thị name/sku
 * lấy từ item master nếu có itemId, else dùng itemName/itemSku free-text.
 */
export async function getPRLinesEnriched(prId: string, exec: Pick<typeof db, "select"> = db) {
  const rows = await exec
    .select({
      id: purchaseRequestLine.id,
      lineNo: purchaseRequestLine.lineNo,
      itemId: purchaseRequestLine.itemId,
      // V3.7.72 — sku/name từ master (nullable khi itemId NULL)
      masterSku: item.sku,
      masterName: item.name,
      masterUom: item.uom,
      // V3.7.72 — free-text fallback
      itemSku: purchaseRequestLine.itemSku,
      itemName: purchaseRequestLine.itemName,
      qty: purchaseRequestLine.qty,
      preferredSupplierId: purchaseRequestLine.preferredSupplierId,
      snapshotLineId: purchaseRequestLine.snapshotLineId,
      neededBy: purchaseRequestLine.neededBy,
      notes: purchaseRequestLine.notes,
      grossRequiredQty: bomSnapshotLine.grossRequiredQty,
      remainingShortQty: bomSnapshotLine.remainingShortQty,
      // V3.7.55 — MRF GTAM line fields
      specification: purchaseRequestLine.specification,
      uom: purchaseRequestLine.uom,
      priority: purchaseRequestLine.priority,
      category: purchaseRequestLine.category,
      estimatedUnitPrice: purchaseRequestLine.estimatedUnitPrice,
      referenceCode: purchaseRequestLine.referenceCode,
      approvedQty: purchaseRequestLine.approvedQty,
      // V3.7.69 YCVT
      onHandSnapshot: purchaseRequestLine.onHandSnapshot,
      lineTotal: purchaseRequestLine.lineTotal,
      // V3.10 DNVT — Tham khảo + Ngày giao hàng.
      referenceNote: purchaseRequestLine.referenceNote,
      deliveryDate: purchaseRequestLine.deliveryDate,
      // V4.0 Wave 3 Phase B — mã ID hệ thống duy nhất (khác referenceCode).
      lineRefCode: purchaseRequestLine.lineRefCode,
    })
    .from(purchaseRequestLine)
    .leftJoin(item, eq(item.id, purchaseRequestLine.itemId))
    .leftJoin(
      bomSnapshotLine,
      eq(bomSnapshotLine.id, purchaseRequestLine.snapshotLineId),
    )
    .where(eq(purchaseRequestLine.prId, prId))
    .orderBy(purchaseRequestLine.lineNo);

  // Resolve display fields với fallback: master → free-text
  return rows.map((r) => ({
    ...r,
    sku: r.masterSku ?? r.itemSku ?? null,
    name: r.masterName ?? r.itemName ?? null,
    itemUom: r.masterUom ?? null,
  }));
}
