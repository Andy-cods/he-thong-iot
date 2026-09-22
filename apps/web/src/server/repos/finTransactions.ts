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

export async function listFinTransactions(opts: {
  direction?: "IN" | "OUT";
  accountId?: string;
  categoryId?: string;
  supplierId?: string;
  status?: "DRAFT" | "POSTED" | "VOID";
  hasInvoice?: boolean;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}) {
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

  const whereExpr = where.length > 0 ? and(...where) : undefined;
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
      seqPart: 2,
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
