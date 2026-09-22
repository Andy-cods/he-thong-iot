// LƯU Ý: numeric(18,2) trả về string qua Drizzle/pg driver — convert Number()
// trước khi tính toán/serialize cho chart (xem wave-2-finance.md §C.4).
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { finInvoice, finPaymentAllocation } from "@iot/db/schema";
import type {
  FinInvoiceCreate,
  FinInvoiceStatus,
  FinInvoiceUpdate,
} from "@iot/shared";
import { db } from "@/lib/db";

/** Transaction handle của Drizzle (giống pattern `_docNumber.ts`). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function listFinInvoices(opts: {
  direction?: "IN" | "OUT";
  status?: FinInvoiceStatus[];
  supplierId?: string;
  overdue?: boolean;
  page: number;
  pageSize: number;
}) {
  const where: SQL[] = [];
  if (opts.direction) where.push(eq(finInvoice.direction, opts.direction));
  if (opts.status && opts.status.length > 0)
    where.push(inArray(finInvoice.status, opts.status));
  if (opts.supplierId) where.push(eq(finInvoice.supplierId, opts.supplierId));
  if (opts.overdue) {
    where.push(sql`${finInvoice.dueDate} < CURRENT_DATE`);
    where.push(inArray(finInvoice.status, ["UNPAID", "PARTIAL", "OVERDUE"]));
  }
  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const offset = (opts.page - 1) * opts.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(finInvoice)
      .where(whereExpr ?? sql`true`),
    db
      .select()
      .from(finInvoice)
      .where(whereExpr ?? sql`true`)
      .orderBy(desc(finInvoice.issueDate), desc(finInvoice.createdAt))
      .limit(opts.pageSize)
      .offset(offset),
  ]);
  return { rows, total: totalResult[0]?.count ?? 0 };
}

export async function getFinInvoiceById(id: string) {
  const [row] = await db.select().from(finInvoice).where(eq(finInvoice.id, id)).limit(1);
  return row ?? null;
}

/** Lịch sử allocation (join fin_payment_allocation) cho 1 invoice. */
export async function getInvoiceAllocations(invoiceId: string) {
  return db
    .select()
    .from(finPaymentAllocation)
    .where(eq(finPaymentAllocation.invoiceId, invoiceId))
    .orderBy(desc(finPaymentAllocation.createdAt));
}

export async function createFinInvoice(input: FinInvoiceCreate, actorId: string | null) {
  const [row] = await db
    .insert(finInvoice)
    .values({
      invoiceNo: input.invoiceNo,
      direction: input.direction,
      supplierId: input.supplierId ?? null,
      purchaseOrderId: input.purchaseOrderId ?? null,
      salesOrderId: input.salesOrderId ?? null,
      issueDate: input.issueDate.toISOString().slice(0, 10),
      dueDate: input.dueDate ? input.dueDate.toISOString().slice(0, 10) : null,
      subtotalAmount: String(input.subtotalAmount),
      vatRate: String(input.vatRate ?? 8),
      vatAmount: String(input.vatAmount),
      totalAmount: String(input.totalAmount),
      notes: input.notes ?? null,
      attachmentUrl: input.attachmentUrl ?? null,
      createdBy: actorId,
    })
    .returning();
  return row;
}

/** Sửa hoá đơn — chỉ dueDate/notes/attachmentUrl (chặn sửa số tiền ở route nếu đã có allocation). */
export async function updateFinInvoice(id: string, input: FinInvoiceUpdate) {
  const patch: Record<string, unknown> = {};
  if (input.dueDate !== undefined)
    patch.dueDate = input.dueDate ? input.dueDate.toISOString().slice(0, 10) : null;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.attachmentUrl !== undefined) patch.attachmentUrl = input.attachmentUrl;
  patch.updatedAt = new Date();

  const [row] = await db
    .update(finInvoice)
    .set(patch)
    .where(eq(finInvoice.id, id))
    .returning();
  return row ?? null;
}

/** Huỷ hoá đơn (status→CANCELLED), chỉ khi paidAmount=0 — check ở route trước khi gọi. */
export async function cancelFinInvoice(id: string) {
  const [row] = await db
    .update(finInvoice)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(finInvoice.id, id))
    .returning();
  return row ?? null;
}

/**
 * Tính lại `paidAmount`/`status` của 1 hoá đơn — APPLICATION LAYER (KHÔNG
 * trigger SQL), theo quyết định wave-2-finance.md §A.3.2. Gọi trong CÙNG
 * transaction Drizzle với insert/delete `fin_payment_allocation` (xem
 * `finPayments.ts`).
 *
 * Quy tắc status:
 *  - paid <= 0            → UNPAID (hoặc OVERDUE nếu đã quá hạn)
 *  - 0 < paid < total      → PARTIAL (hoặc OVERDUE nếu đã quá hạn)
 *  - paid >= total         → PAID
 *  - status hiện tại là CANCELLED → giữ nguyên, không tự đổi lại (invoice đã huỷ).
 */
export async function recalcInvoicePaidAmount(tx: Tx, invoiceId: string) {
  const [invoiceRow] = await tx
    .select({
      totalAmount: finInvoice.totalAmount,
      dueDate: finInvoice.dueDate,
      status: finInvoice.status,
    })
    .from(finInvoice)
    .where(eq(finInvoice.id, invoiceId))
    .limit(1);
  if (!invoiceRow) return null;
  if (invoiceRow.status === "CANCELLED") return null;

  const [sumRow] = await tx
    .select({ paid: sql<string>`coalesce(sum(${finPaymentAllocation.amount}), 0)` })
    .from(finPaymentAllocation)
    .where(eq(finPaymentAllocation.invoiceId, invoiceId));

  const paid = Number(sumRow?.paid ?? 0);
  const total = Number(invoiceRow.totalAmount);
  const isOverdue = Boolean(
    invoiceRow.dueDate && invoiceRow.dueDate < new Date().toISOString().slice(0, 10),
  );

  let status: FinInvoiceStatus;
  if (paid >= total && total > 0) {
    status = "PAID";
  } else if (paid > 0) {
    status = isOverdue ? "OVERDUE" : "PARTIAL";
  } else {
    status = isOverdue ? "OVERDUE" : "UNPAID";
  }

  const [row] = await tx
    .update(finInvoice)
    .set({ paidAmount: String(paid), status, updatedAt: new Date() })
    .where(eq(finInvoice.id, invoiceId))
    .returning();
  return row ?? null;
}

export interface AgingBucketRow {
  bucket: string;
  invoiceCount: number;
  outstandingAmount: number;
}

/**
 * C.1 — Aging bucket công nợ theo `direction`, query động KHÔNG bảng lưu
 * trữ. `direction='OUT'` = công nợ PHẢI THU (khách nợ mình); `direction='IN'`
 * = công nợ PHẢI TRẢ (mình nợ NCC). Trả outstanding_amount đã convert
 * Number() (xem cảnh báo §C.4).
 *
 * TASK-20260922 — tổng quát hoá từ `getReceivablesAging()` cũ (chỉ nhận
 * OUT hard-code) để tái dùng chung cho cả 2 chiều công nợ, tránh trùng SQL.
 */
async function getInvoiceAging(direction: "IN" | "OUT"): Promise<AgingBucketRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      CASE
        WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN 'CURRENT'
        WHEN CURRENT_DATE - due_date BETWEEN 1 AND 30 THEN '1-30'
        WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60 THEN '31-60'
        WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90 THEN '61-90'
        ELSE '90+'
      END AS bucket,
      COUNT(*)::int AS invoice_count,
      SUM(total_amount - paid_amount) AS outstanding_amount
    FROM app.fin_invoice
    WHERE direction = ${direction} AND status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
    GROUP BY bucket
  `)) as unknown as Array<{
    bucket: string;
    invoice_count: number;
    outstanding_amount: string | null;
  }>;

  return rows.map((r) => ({
    bucket: r.bucket,
    invoiceCount: Number(r.invoice_count),
    outstandingAmount: Number(r.outstanding_amount ?? 0),
  }));
}

/** Công nợ PHẢI THU (direction=OUT) — khách hàng nợ mình. Giữ nguyên tên cũ (không phá link cũ). */
export async function getReceivablesAging(): Promise<AgingBucketRow[]> {
  return getInvoiceAging("OUT");
}

/** Công nợ PHẢI TRẢ (direction=IN) — mình nợ nhà cung cấp. */
export async function getPayablesAging(): Promise<AgingBucketRow[]> {
  return getInvoiceAging("IN");
}

export interface PartnerAgingRow {
  /** id đối tác — chỉ có với NCC (supplierId); null khi group theo tên khách trong notes (OUT). */
  partnerId: string | null;
  partnerName: string;
  invoiceCount: number;
  outstandingAmount: number;
  /** Số ngày quá hạn của hoá đơn quá hạn LÂU NHẤT trong nhóm — 0 nếu chưa có hoá đơn nào quá hạn. */
  maxOverdueDays: number;
}

/**
 * Công nợ PHẢI TRẢ nhóm theo NHÀ CUNG CẤP (direction=IN, có `supplierId` FK
 * thật) — join `supplier` lấy tên. Sắp theo outstanding giảm dần (nợ nhiều
 * nhất lên đầu).
 */
export async function getPayablesBySupplier(): Promise<PartnerAgingRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      fi.supplier_id AS partner_id,
      COALESCE(s.name, '(Không rõ NCC)') AS partner_name,
      COUNT(*)::int AS invoice_count,
      SUM(fi.total_amount - fi.paid_amount) AS outstanding_amount,
      COALESCE(MAX(GREATEST(CURRENT_DATE - fi.due_date, 0)), 0)::int AS max_overdue_days
    FROM app.fin_invoice fi
    LEFT JOIN app.supplier s ON s.id = fi.supplier_id
    WHERE fi.direction = 'IN' AND fi.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
    GROUP BY fi.supplier_id, s.name
    ORDER BY outstanding_amount DESC
  `)) as unknown as Array<{
    partner_id: string | null;
    partner_name: string;
    invoice_count: number;
    outstanding_amount: string | null;
    max_overdue_days: number;
  }>;

  return rows.map((r) => ({
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    invoiceCount: Number(r.invoice_count),
    outstandingAmount: Number(r.outstanding_amount ?? 0),
    maxOverdueDays: Number(r.max_overdue_days ?? 0),
  }));
}

/**
 * Công nợ PHẢI THU nhóm theo KHÁCH HÀNG (direction=OUT). GIỚI HẠN QUAN TRỌNG:
 * `fin_invoice` KHÔNG có FK khách hàng cho hoá đơn OUT — tên khách (nếu có)
 * nằm tự do trong cột `notes`. V1 dùng luôn `notes` làm khoá nhóm (KHÔNG
 * chuẩn hoá được, hoá đơn không có notes hoặc notes khác nhau dù cùng khách
 * sẽ bị tách nhóm) — chấp nhận giới hạn này theo YAGNI, ghi rõ ở UI.
 */
export async function getReceivablesByCustomer(): Promise<PartnerAgingRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      NULL::uuid AS partner_id,
      COALESCE(NULLIF(TRIM(fi.notes), ''), '(Chưa ghi tên khách hàng)') AS partner_name,
      COUNT(*)::int AS invoice_count,
      SUM(fi.total_amount - fi.paid_amount) AS outstanding_amount,
      COALESCE(MAX(GREATEST(CURRENT_DATE - fi.due_date, 0)), 0)::int AS max_overdue_days
    FROM app.fin_invoice fi
    WHERE fi.direction = 'OUT' AND fi.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
    GROUP BY COALESCE(NULLIF(TRIM(fi.notes), ''), '(Chưa ghi tên khách hàng)')
    ORDER BY outstanding_amount DESC
  `)) as unknown as Array<{
    partner_id: string | null;
    partner_name: string;
    invoice_count: number;
    outstanding_amount: string | null;
    max_overdue_days: number;
  }>;

  return rows.map((r) => ({
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    invoiceCount: Number(r.invoice_count),
    outstandingAmount: Number(r.outstanding_amount ?? 0),
    maxOverdueDays: Number(r.max_overdue_days ?? 0),
  }));
}

/**
 * C.3 — Dòng tiền theo ngày, nguồn DUY NHẤT là fin_transaction (§C.2, tránh
 * double-count). `from`/`to` dạng 'YYYY-MM-DD'.
 */
export async function getCashflowSeries(from: string, to: string) {
  const rows = (await db.execute(sql`
    SELECT
      transaction_date,
      SUM(CASE WHEN direction='IN' THEN amount ELSE 0 END) AS total_in,
      SUM(CASE WHEN direction='OUT' THEN amount ELSE 0 END) AS total_out
    FROM app.fin_transaction
    WHERE status = 'POSTED' AND transaction_date BETWEEN ${from} AND ${to}
    GROUP BY transaction_date
    ORDER BY transaction_date
  `)) as unknown as Array<{
    transaction_date: string;
    total_in: string;
    total_out: string;
  }>;

  return rows.map((r) => ({
    date: r.transaction_date,
    in: Number(r.total_in),
    out: Number(r.total_out),
    net: Number(r.total_in) - Number(r.total_out),
  }));
}

/** Tổng in/out cho 1 khoảng ngày — dùng cho summary + growth% (kỳ trước). */
export async function getCashflowTotals(from: string, to: string) {
  const [row] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN direction='OUT' THEN amount ELSE 0 END), 0) AS total_out
    FROM app.fin_transaction
    WHERE status = 'POSTED' AND transaction_date BETWEEN ${from} AND ${to}
  `)) as unknown as Array<{ total_in: string; total_out: string }>;

  return {
    totalIn: Number(row?.total_in ?? 0),
    totalOut: Number(row?.total_out ?? 0),
  };
}

/** Tổng số dư hiện tại của tất cả tài khoản đang hoạt động — dashboard summary. */
export async function getAccountsBalanceSummary() {
  const [row] = (await db.execute(sql`
    SELECT COALESCE(SUM(current_balance), 0) AS total_balance
    FROM app.fin_account
    WHERE is_active = true
  `)) as unknown as Array<{ total_balance: string }>;
  return Number(row?.total_balance ?? 0);
}
