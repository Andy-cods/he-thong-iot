import { and, desc, eq, gte, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import { finTransaction } from "@iot/db/schema";
import type { FinTransactionCreate, FinTransactionUpdate } from "@iot/shared";
import { db } from "@/lib/db";
import { currentYymm, genDocNo } from "./_docNumber";

/**
 * Repo `fin_transaction` — Giao dịch thu/chi hàng ngày, bảng TRUNG TÂM + NGUỒN
 * SỰ THẬT DUY NHẤT cho "tổng đã thu/đã chi" (xem
 * plans/v4-finance/wave-2-finance.md §C.2). Mọi tổng hợp dòng tiền (dashboard,
 * KPI, export) PHẢI query trên bảng này với status='POSTED', KHÔNG BAO GIỜ
 * cộng thêm `fin_payment.totalAmount` song song — payment có allocation đã có
 * transaction tương ứng do `finPayments.createPaymentWithAllocations` sinh ra
 * (mỗi allocation → đúng 1 transaction), cộng thêm sẽ đếm trùng.
 *
 * `createTransaction` ở đây CHỈ dùng cho luồng "KHÔNG hoá đơn" (nhập tay,
 * invoiceId/paymentId đều null). Luồng "CÓ hoá đơn" đi qua
 * `finPayments.createPaymentWithAllocations`, KHÔNG được gọi hàm này.
 */

/** Bộ lọc dùng chung cho list + stats (cùng điều kiện → số liệu luôn khớp). */
export interface FinTransactionFilterOpts {
  direction?: "IN" | "OUT";
  accountId?: string;
  categoryId?: string;
  supplierId?: string;
  status?: "DRAFT" | "POSTED" | "VOID";
  hasInvoice?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Dựng mệnh đề WHERE từ bộ lọc. Tách riêng để `listFinTransactions` và
 * `getFinTransactionStats` dùng CHUNG — nếu mỗi hàm tự dựng điều kiện thì
 * bảng và ô tổng dễ lệch nhau khi ai đó sửa 1 bên mà quên bên kia.
 */
function buildTxnWhere(opts: FinTransactionFilterOpts): SQL | undefined {
  const where: SQL[] = [];
  if (opts.direction) where.push(eq(finTransaction.direction, opts.direction));
  if (opts.accountId) where.push(eq(finTransaction.accountId, opts.accountId));
  if (opts.categoryId) where.push(eq(finTransaction.categoryId, opts.categoryId));
  if (opts.supplierId) where.push(eq(finTransaction.supplierId, opts.supplierId));
  if (opts.status) where.push(eq(finTransaction.status, opts.status));
  if (opts.hasInvoice !== undefined) {
    where.push(
      opts.hasInvoice
        ? isNotNull(finTransaction.invoiceId)
        : isNull(finTransaction.invoiceId),
    );
  }
  if (opts.dateFrom) where.push(gte(finTransaction.transactionDate, opts.dateFrom));
  if (opts.dateTo) where.push(lte(finTransaction.transactionDate, opts.dateTo));
  return where.length > 0 ? and(...where) : undefined;
}

/**
 * Tổng thu / tổng chi của TOÀN BỘ giao dịch khớp bộ lọc — tính bằng SUM ở DB,
 * KHÔNG phụ thuộc phân trang.
 *
 * Lý do tồn tại: trước đây UI tự cộng tay trên `pageSize=1000`, nhưng zod giới
 * hạn `pageSize` tối đa 200 → request 422 → ô "Tổng đã thu/chi" LUÔN hiện 0đ
 * dù bảng có dữ liệu (bug thật, phát hiện khi chụp ảnh tài liệu 2026-09-22).
 * Tính ở DB vừa sửa lỗi vừa bỏ luôn giới hạn 1.000 giao dịch.
 *
 * VOID bị loại khỏi tổng (chứng từ đã huỷ không tính vào dòng tiền), trừ khi
 * người dùng chủ động lọc `status=VOID` để soi riêng.
 */
export async function getFinTransactionStats(opts: FinTransactionFilterOpts) {
  const whereExpr = buildTxnWhere(opts);
  const voidFilter =
    opts.status === undefined
      ? sql`AND status <> 'VOID'`
      : sql``;

  const [row] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'IN'  THEN amount ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0) AS total_out,
      COUNT(*)::int AS txn_count
    FROM app.fin_transaction
    WHERE ${whereExpr ?? sql`TRUE`} ${voidFilter}
  `)) as unknown as Array<{
    total_in: string;
    total_out: string;
    txn_count: number;
  }>;

  return {
    totalIn: Number(row?.total_in ?? 0),
    totalOut: Number(row?.total_out ?? 0),
    txnCount: Number(row?.txn_count ?? 0),
  };
}

export async function listFinTransactions(
  opts: FinTransactionFilterOpts & { page: number; pageSize: number },
) {
  const whereExpr = buildTxnWhere(opts);
  const offset = (opts.page - 1) * opts.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(finTransaction)
      .where(whereExpr ?? sql`true`),
    db
      .select()
      .from(finTransaction)
      .where(whereExpr ?? sql`true`)
      .orderBy(desc(finTransaction.transactionDate), desc(finTransaction.createdAt))
      .limit(opts.pageSize)
      .offset(offset),
  ]);
  return { rows, total: totalResult[0]?.count ?? 0 };
}

export async function getFinTransactionById(id: string) {
  const [row] = await db
    .select()
    .from(finTransaction)
    .where(eq(finTransaction.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Tạo giao dịch thủ công — CHỈ dùng cho luồng KHÔNG hoá đơn (invoiceId có thể
 * có, nhưng paymentId LUÔN null — không được set thủ công, xem doc-comment
 * đầu file). Sinh mã `PT-{yymm}-{seq}` (thu) / `PC-{yymm}-{seq}` (chi).
 */
export async function createTransaction(
  input: FinTransactionCreate,
  actorId: string | null,
) {
  return db.transaction(async (tx) => {
    const prefix = `${input.direction === "IN" ? "PT" : "PC"}-${currentYymm()}`;
    const code = await genDocNo(tx, {
      table: "app.fin_transaction",
      column: "code",
      prefix,
      // Mã dạng `PC-2609-0001` → SPLIT_PART theo '-' cho 3 phần, seq ở phần 3.
      // (Từng để 2 → lấy nhầm "2609" làm seq → sinh mã PC-2609-2610 và vỡ
      // unique constraint ở giao dịch thứ hai. Bắt được khi chạy e2e thật.)
      seqPart: 3,
      pad: 4,
    });

    const [row] = await tx
      .insert(finTransaction)
      .values({
        code,
        direction: input.direction,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        amount: String(input.amount),
        transactionDate: input.transactionDate.toISOString().slice(0, 10),
        description: input.description ?? null,
        counterpartyType: input.counterpartyType ?? null,
        supplierId: input.supplierId ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        salesOrderId: input.salesOrderId ?? null,
        invoiceId: input.invoiceId ?? null,
        // paymentId KHÔNG set — luồng thủ công không đi qua payment (§C.2).
        paymentId: null,
        attachmentUrl: input.attachmentUrl ?? null,
        externalRef: input.externalRef ?? null,
        status: "POSTED",
        createdBy: actorId,
      })
      .returning();
    if (!row) throw new Error("FIN_TRANSACTION_INSERT_FAILED");
    return row;
  });
}

/**
 * Sửa giao dịch — chỉ cho phép sửa description/attachmentUrl/categoryId (giữ
 * nguyên amount/direction/account để không phá vỡ audit trail + trigger số dư
 * — theo B.3 #11: giao dịch POSTED không cho sửa amount).
 */
export async function updateTransaction(id: string, input: FinTransactionUpdate) {
  const patch: Record<string, unknown> = {};
  if (input.description !== undefined) patch.description = input.description;
  if (input.attachmentUrl !== undefined) patch.attachmentUrl = input.attachmentUrl;
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  patch.updatedAt = new Date();

  const [row] = await db
    .update(finTransaction)
    .set(patch)
    .where(eq(finTransaction.id, id))
    .returning();
  return row ?? null;
}

/**
 * Huỷ giao dịch (status→VOID, KHÔNG xoá cứng — giữ audit trail). Trigger
 * `fin_account_recalc_balance` tự trừ lại balance vì trigger chỉ SUM những
 * dòng `status='POSTED'`.
 */
export async function voidTransaction(id: string) {
  const [row] = await db
    .update(finTransaction)
    .set({ status: "VOID", updatedAt: new Date() })
    .where(eq(finTransaction.id, id))
    .returning();
  return row ?? null;
}
