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
import { vnToday } from "../../lib/procurement-policy";
import { deriveDisplayLabel } from "@/lib/pr-display-label";
import { currentYymm, genDocNoBatch } from "./_docNumber";
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
  const statusCond =
    q.status && q.status.length > 0
      ? inArray(
          purchaseRequest.status,
          q.status as unknown as (typeof purchaseRequest.status.enumValues)[number][],
        )
      : undefined;
  const draftCond = draftVisibilityCondition(q.viewer);
  if (draftCond) where.push(draftCond);
  const term = q.q?.trim();
  if (term) {
    const like = `%${escapeLike(term)}%`;
    where.push(sql`(
      ${purchaseRequest.code} ILIKE ${like}
      OR COALESCE(${purchaseRequest.paperFormNo}, '') ILIKE ${like}
      OR COALESCE(${purchaseRequest.title}, '') ILIKE ${like}
      OR EXISTS (
        SELECT 1 FROM ${purchaseRequestLine} qpl
        LEFT JOIN ${item} qit ON qit.id = qpl.item_id
        WHERE qpl.pr_id = ${purchaseRequest.id}
          AND (
            COALESCE(qit.name, qpl.item_name, '') ILIKE ${like}
            OR COALESCE(qit.sku, qpl.item_sku, '') ILIKE ${like}
          )
      )
      OR EXISTS (
        SELECT 1 FROM ${userAccount} qu
        WHERE qu.id = ${purchaseRequest.requestedBy}
          AND (COALESCE(qu.full_name, '') ILIKE ${like} OR qu.username ILIKE ${like})
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
        count: sql<number>`count(*)::int`,
      })
      .from(purchaseRequest)
      .leftJoin(salesOrder, eq(salesOrder.id, purchaseRequest.linkedOrderId))
      .where(whereBase)
      .groupBy(purchaseRequest.status, purchaseRequest.approvalStep),
  ]);

  const counts: PRStatusCounts = {
    byStatus: {},
    bySubmittedStep: { SUBMITTED: 0, DEPT_APPROVED: 0 },
    all: 0,
  };
  for (const c of countRows) {
    const st = c.status as PurchaseRequestStatus;
    counts.byStatus[st] = (counts.byStatus[st] ?? 0) + c.count;
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
    WHERE bsl.component_item_id = ANY(${itemIds})
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
        approvedQty: l.approvedQty != null ? String(l.approvedQty) : null,
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

/**
 * V3.7.69 YCVT — Step 2: Trưởng bộ phận duyệt.
 * SUBMITTED → DEPT_APPROVED.
 */
export async function deptApprovePR(
  id: string,
  approverId: string,
  note?: string | null,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({
      approvalStep: "DEPT_APPROVED",
      deptApprovedBy: approverId,
      deptApprovedAt: new Date(),
      deptApprovalNote: note ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseRequest.id, id),
        eq(purchaseRequest.approvalStep, "SUBMITTED"),
      ),
    )
    .returning();
  return row ?? null;
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
): Promise<PurchaseRequest | null> {
  const now = new Date();
  const quickNote = note ?? "Duyệt nhanh (Admin)";
  const [row] = await db
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
  return row ?? null;
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
    const cap = line.approvedQty ?? line.qty;
    const issued = line.issuedQty ?? 0;
    const remaining = Math.max(0, cap - issued);
    if (qty > remaining + PR_ISSUE_EPS) {
      const label = line.sku ?? "Dòng";
      const capLabel = line.approvedQty != null ? "SL đã duyệt" : "SL đề xuất";
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
  lines: { id: string; cap: number; issued: number; remaining: number }[];
}

/**
 * THUẦN (L8) — tiến độ xuất kho của PR. Dòng nhập tay (không itemId) không trừ tồn
 * được nên KHÔNG tính vào điều kiện hoàn tất (nếu không phiếu sẽ không bao giờ đủ —
 * Kho kết thúc thủ công bằng "Kết thúc, không xuất thêm").
 */
export function computePrIssueProgress(lines: PrIssueLineState[]): PrIssueProgress {
  const out = lines.map((l) => {
    const cap = l.approvedQty ?? l.qty;
    const issued = l.issuedQty ?? 0;
    return { id: l.id, cap, issued, remaining: Math.max(0, cap - issued) };
  });
  const tracked = lines
    .map((l, i) => ({ l, o: out[i]! }))
    .filter((x) => !!x.l.itemId);
  const pending = tracked.filter((x) => x.o.remaining > PR_ISSUE_EPS).length;
  return { complete: tracked.length > 0 && pending === 0, pendingLines: pending, lines: out };
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
    if (current.status !== "APPROVED" && current.status !== "CONVERTED") {
      throw new GoodsIssueError(
        "INVALID_STATE",
        "Phiếu chưa được duyệt xong — chưa ghi nhận xuất kho được.",
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

    if (input.noStockConfirm) {
      const reason = (input.noStockReason ?? "").trim();
      if (reason.length < 3) {
        throw new GoodsIssueError(
          "NO_STOCK_REASON_REQUIRED",
          "Cần nhập lý do (tối thiểu 3 ký tự) khi ghi nhận đã xuất không trừ tồn.",
          422,
        );
      }
      complete = true;
    } else {
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

      const lineStates: PrIssueLineState[] = lineRows.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        sku: l.masterSku ?? l.itemSku ?? null,
        qty: Number(l.qty) || 0,
        approvedQty: l.approvedQty != null ? Number(l.approvedQty) : null,
        issuedQty: issuedByLine.get(l.id) ?? 0,
      }));

      if (input.picks.length === 0) {
        // Chỉ hợp lệ khi "Kết thúc, không xuất thêm" sau ≥ 1 đợt đã xuất.
        if (!input.finish) {
          throw new GoodsIssueError("EMPTY_ISSUE", "Chưa chọn lô xuất cho dòng nào.", 400);
        }
        if (!hadEarlierIssue) {
          throw new GoodsIssueError(
            "EMPTY_ISSUE",
            'Chưa xuất đợt nào — chọn lô để xuất, hoặc dùng "Ghi nhận đã xuất — không trừ tồn" kèm lý do.',
            422,
          );
        }
        progress = computePrIssueProgress(lineStates);
        complete = true;
      } else {
        const v = validatePrIssuePicks(lineStates, input.picks);
        if (!v.ok) throw v.error;

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

        // Tính lại tiến độ SAU đợt này.
        const afterStates = lineStates.map((l) => ({
          ...l,
          issuedQty:
            (l.issuedQty ?? 0) +
            v.picks
              .filter((p) => p.purchaseRequestLineId === l.id)
              .reduce((a, p) => a + p.qty, 0),
        }));
        progress = computePrIssueProgress(afterStates);
        complete = !!input.finish || progress.complete;
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
        ...(input.noStockConfirm
          ? {
              notes: sql`COALESCE(${purchaseRequest.notes}, '') || ${`\n[Đã xuất kho — KHÔNG trừ tồn: ${(input.noStockReason ?? "").trim()}]`}`,
            }
          : {}),
        ...(input.finish && progress && !progress.complete
          ? {
              notes: sql`COALESCE(${purchaseRequest.notes}, '') || ${`\n[Kết thúc xuất kho — còn ${progress.pendingLines} dòng chưa xuất đủ]`}`,
            }
          : {}),
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

/** Reject PR đang chờ duyệt → REJECTED. Guard approval_step ngay trong UPDATE để tránh race với thao tác duyệt. */
export async function rejectPR(
  id: string,
  userId: string | null,
  reason?: string | null,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({
      status: "REJECTED",
      approvalStep: "REJECTED",
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectionReason: reason ?? null,
      notes: sql`COALESCE(${purchaseRequest.notes}, '') || ${
        reason ? `\n[REJECTED: ${reason}]` : "\n[REJECTED]"
      }`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseRequest.id, id),
        inArray(purchaseRequest.approvalStep, [
          "SUBMITTED",
          "DEPT_APPROVED",
        ]),
      ),
    )
    .returning();
  return row ?? null;
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
        notes: sql`COALESCE(${purchaseRequest.notes}, '') || ${`\n[CANCELLED: ${reason}]`}`,
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
export async function getPRIssuedQtyByLine(prId: string): Promise<Map<string, number>> {
  const rows = await db
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
  if (keep.length === 0) {
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
      qty: Number(l.qty),
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
  return { pr, copiedLines: keep.length, skippedLines: skipped };
}

/**
 * Enrichment helper: join PR line với item master.
 * V3.7.72 — LEFT JOIN item (vì itemId nullable). Fallback hiển thị name/sku
 * lấy từ item master nếu có itemId, else dùng itemName/itemSku free-text.
 */
export async function getPRLinesEnriched(prId: string) {
  const rows = await db
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
