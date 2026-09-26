// LƯU Ý: numeric(18,2) trả về string qua Drizzle/pg driver — convert Number()
// trước khi tính toán/serialize cho chart (xem wave-2-finance.md §C.4).
import { and, desc, eq, getTableColumns, inArray, ne, sql, type SQL } from "drizzle-orm";
import { finInvoice, finPaymentAllocation, supplier } from "@iot/db/schema";
import type {
  FinInvoiceCreate,
  FinInvoiceStatus,
  FinInvoiceUpdate,
} from "@iot/shared";
import { db } from "@/lib/db";
import { isoDateVN, vnToday } from "@/lib/finance";

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
    // V4.1 TC-03 — kèm tên đối tác (LEFT JOIN supplier) → UI không cần tải
    // danh sách NCC riêng (pageSize 200 > giới hạn 100 → 422 → cột "Đối tác" "—").
    db
      .select({ ...getTableColumns(finInvoice), supplierName: supplier.name })
      .from(finInvoice)
      .leftJoin(supplier, eq(supplier.id, finInvoice.supplierId))
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

/** Chi tiết HĐ kèm tên đối tác (TC-03/TC-16 — UI không phải tra danh sách NCC). */
export async function getFinInvoiceWithPartner(id: string) {
  const [row] = await db
    .select({ ...getTableColumns(finInvoice), supplierName: supplier.name })
    .from(finInvoice)
    .leftJoin(supplier, eq(supplier.id, finInvoice.supplierId))
    .where(eq(finInvoice.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * V4.1 TC-25 — Trạng thái HĐ theo số đã trả (thuần, có test). HĐ 0 ₫ không nợ
 * gì → PAID ngay (trước đây `paid >= total && total > 0` làm HĐ 0 ₫ kẹt
 * "Chưa trả" mãi).
 */
export function computeInvoiceStatus(input: {
  total: number;
  paid: number;
  dueDate: string | null;
  today: string;
}): FinInvoiceStatus {
  const isOverdue = Boolean(input.dueDate && input.dueDate < input.today);
  if (input.paid >= input.total) return "PAID";
  if (input.paid > 0) return isOverdue ? "OVERDUE" : "PARTIAL";
  return isOverdue ? "OVERDUE" : "UNPAID";
}

/** Lỗi trùng số HĐ (TC-10) — route map 409. */
export class FinInvoiceDuplicateError extends Error {
  constructor(public invoiceNo: string) {
    super("FIN_INVOICE_DUPLICATE");
  }
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
  return db.transaction(async (tx) => {
    // V4.1 TC-10 — unique index (direction, invoice_no, supplier_id) KHÔNG chặn
    // khi supplier_id NULL (NULL ≠ NULL) → HĐ đầu ra không chọn khách trùng số
    // vô hạn. Kiểm ở app: advisory lock theo (chiều, số HĐ) rồi tìm HĐ chưa huỷ
    // cùng số + cùng đối tác (IS NOT DISTINCT FROM, tính cả NULL).
    const invoiceKey = `fininv:${input.direction}:${input.invoiceNo.trim().toUpperCase()}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${invoiceKey}))`);
    const [dup] = await tx
      .select({ id: finInvoice.id })
      .from(finInvoice)
      .where(
        and(
          eq(finInvoice.direction, input.direction),
          sql`upper(${finInvoice.invoiceNo}) = upper(${input.invoiceNo.trim()})`,
          sql`${finInvoice.supplierId} IS NOT DISTINCT FROM ${input.supplierId ?? null}::uuid`,
          ne(finInvoice.status, "CANCELLED"),
        ),
      )
      .limit(1);
    if (dup) throw new FinInvoiceDuplicateError(input.invoiceNo);

    const total = Number(input.totalAmount);
    const issueDate = isoDateVN(input.issueDate);
    const dueDate = input.dueDate ? isoDateVN(input.dueDate) : null;
    const [row] = await tx
      .insert(finInvoice)
      .values({
      invoiceNo: input.invoiceNo,
      direction: input.direction,
      supplierId: input.supplierId ?? null,
      purchaseOrderId: input.purchaseOrderId ?? null,
      salesOrderId: input.salesOrderId ?? null,
      issueDate,
      dueDate,
      subtotalAmount: String(input.subtotalAmount),
      vatRate: String(input.vatRate ?? 8),
      vatAmount: String(input.vatAmount),
      totalAmount: String(input.totalAmount),
      // V4.1 TC-25 — HĐ 0 ₫ = không nợ → PAID ngay; quá hạn tính theo giờ VN.
      status: computeInvoiceStatus({ total, paid: 0, dueDate, today: vnToday() }),
      notes: input.notes ?? null,
      attachmentUrl: input.attachmentUrl ?? null,
      createdBy: actorId,
    })
      .returning();
    return row;
  });
}

/** Sửa hoá đơn — chỉ dueDate/notes/attachmentUrl (chặn sửa số tiền ở route nếu đã có allocation). */
export async function updateFinInvoice(id: string, input: FinInvoiceUpdate) {
  const patch: Record<string, unknown> = {};
  if (input.dueDate !== undefined)
    patch.dueDate = input.dueDate ? isoDateVN(input.dueDate) : null;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.attachmentUrl !== undefined) patch.attachmentUrl = input.attachmentUrl;
  patch.updatedAt = new Date();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(finInvoice)
      .set(patch)
      .where(eq(finInvoice.id, id))
      .returning();
    if (!row) return null;
    // V4.1 TC-11 — gia hạn (đổi dueDate) phải tính lại trạng thái: HĐ đang
    // OVERDUE được dời hạn sang tương lai → quay về UNPAID/PARTIAL.
    if (input.dueDate !== undefined) {
      return (await recalcInvoicePaidAmount(tx, id)) ?? row;
    }
    return row;
  });
}

/**
 * Huỷ hoá đơn (status→CANCELLED), chỉ khi CHƯA có thanh toán.
 * V4.1 TC-15 — kiểm + đổi trạng thái trong CÙNG transaction, khoá dòng HĐ
 * `FOR UPDATE` (ghi thanh toán cũng khoá HĐ FOR UPDATE) → hết race "vừa ghi
 * thanh toán vừa huỷ HĐ". Ném `FIN_INVOICE_NOT_FOUND` / `FIN_INVOICE_HAS_PAYMENT`.
 */
export async function cancelFinInvoice(id: string) {
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select({ id: finInvoice.id, status: finInvoice.status, paidAmount: finInvoice.paidAmount })
      .from(finInvoice)
      .where(eq(finInvoice.id, id))
      .for("update");
    if (!cur) throw new Error("FIN_INVOICE_NOT_FOUND");
    if (cur.status !== "CANCELLED") {
      const [alloc] = await tx
        .select({ id: finPaymentAllocation.id })
        .from(finPaymentAllocation)
        .where(eq(finPaymentAllocation.invoiceId, id))
        .limit(1);
      if (Number(cur.paidAmount) > 0 || alloc) throw new Error("FIN_INVOICE_HAS_PAYMENT");
    }
    const [row] = await tx
      .update(finInvoice)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(eq(finInvoice.id, id))
      .returning();
    return row ?? null;
  });
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
  // V4.1 TC-25 + TC-13 — HĐ 0 ₫ là PAID; "hôm nay" theo giờ VN.
  const status = computeInvoiceStatus({
    total,
    paid,
    dueDate: invoiceRow.dueDate,
    today: vnToday(),
  });

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
 * Công nợ PHẢI THU nhóm theo KHÁCH HÀNG (direction=OUT).
 * V4.1 TC-07 — form HĐ đầu ra lưu khách ở `supplier_id` (SupplierPicker dùng
 * chung danh bạ đối tác) → nhóm theo `supplier_id` + tên bảng supplier. HĐ cũ
 * không chọn đối tác mới rơi về tên ghi trong `notes` (hoặc "(Chưa chọn khách
 * hàng)"). Trước đây nhóm CHỈ theo `notes` → mọi HĐ tạo từ giao diện rơi vào
 * "(Chưa ghi tên khách hàng)".
 */
export async function getReceivablesByCustomer(): Promise<PartnerAgingRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      fi.supplier_id AS partner_id,
      COALESCE(s.name, NULLIF(TRIM(fi.notes), ''), '(Chưa chọn khách hàng)') AS partner_name,
      COUNT(*)::int AS invoice_count,
      SUM(fi.total_amount - fi.paid_amount) AS outstanding_amount,
      COALESCE(MAX(GREATEST(CURRENT_DATE - fi.due_date, 0)), 0)::int AS max_overdue_days
    FROM app.fin_invoice fi
    LEFT JOIN app.supplier s ON s.id = fi.supplier_id
    WHERE fi.direction = 'OUT' AND fi.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
    GROUP BY fi.supplier_id, COALESCE(s.name, NULLIF(TRIM(fi.notes), ''), '(Chưa chọn khách hàng)')
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
    -- V4.1 Đợt 3 (Q7) — loại chuyển quỹ nội bộ (điểm tổng hợp 2/3).
    WHERE status = 'POSTED' AND transfer_group_id IS NULL
      AND transaction_date BETWEEN ${from} AND ${to}
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
    -- V4.1 Đợt 3 (Q7) — loại chuyển quỹ nội bộ (điểm tổng hợp 3/3).
    WHERE status = 'POSTED' AND transfer_group_id IS NULL
      AND transaction_date BETWEEN ${from} AND ${to}
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
