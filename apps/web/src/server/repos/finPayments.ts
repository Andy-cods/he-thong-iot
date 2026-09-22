import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { finInvoice, finPayment, finPaymentAllocation, finTransaction } from "@iot/db/schema";
import type { FinPaymentCreate } from "@iot/shared";
import { db } from "@/lib/db";
import { currentYymm, genDocNo } from "./_docNumber";
import { recalcInvoicePaidAmount } from "./finInvoices";

/**
 * ============================================================================
 * BẤT BIẾN CHỐNG ĐẾM TRÙNG "TỔNG ĐÃ THU/ĐÃ CHI" (đọc trước khi sửa file này)
 * ============================================================================
 * `fin_transaction` là NGUỒN SỰ THẬT DUY NHẤT cho mọi con số tổng hợp dòng
 * tiền (dashboard, KPI, export). `fin_payment` KHÔNG BAO GIỜ được cộng song
 * song với `fin_transaction` khi tính tổng — `fin_payment` chỉ dùng để hiển
 * thị "đợt thanh toán" theo góc nhìn kế toán (gộp nhiều invoice trong 1 lần
 * chuyển khoản) và để trace nguồn gốc qua `fin_transaction.paymentId`.
 *
 * Vì vậy MỌI payment có allocation PHẢI sinh ĐÚNG 1 `fin_transaction` cho mỗi
 * allocation (bước 4 dưới đây). Đây KHÔNG phải dư thừa — đừng "tối ưu" bằng
 * cách bỏ bước insert transaction dù nhìn thoáng qua tưởng trùng lặp với
 * payment. Nếu bỏ, "tổng đã chi" sẽ thiếu (vì §C.2 mọi dashboard chỉ query
 * fin_transaction, không query fin_payment) hoặc nếu ai đó "sửa" dashboard để
 * cộng cả 2 nguồn thì sẽ ĐẾM TRÙNG. Xem plans/v4-finance/wave-2-finance.md
 * §C.2 để biết đầy đủ lý do + ràng buộc thực thi.
 *
 * Lớp phòng thủ thứ 2: API tạo transaction thủ công (`POST /api/finance/
 * transactions`, `finTransactionCreateSchema`) KHÔNG có field `paymentId` —
 * không thể set qua đường đó. `paymentId` CHỈ được gán ở bước 4 dưới đây.
 * ============================================================================
 */

export async function listFinPayments(opts: {
  direction?: "IN" | "OUT";
  accountId?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}) {
  const where: SQL[] = [];
  if (opts.direction) where.push(eq(finPayment.direction, opts.direction));
  if (opts.accountId) where.push(eq(finPayment.accountId, opts.accountId));
  if (opts.supplierId) where.push(eq(finPayment.supplierId, opts.supplierId));
  if (opts.dateFrom) where.push(sql`${finPayment.paymentDate} >= ${opts.dateFrom}`);
  if (opts.dateTo) where.push(sql`${finPayment.paymentDate} <= ${opts.dateTo}`);
  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const offset = (opts.page - 1) * opts.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(finPayment)
      .where(whereExpr ?? sql`true`),
    db
      .select()
      .from(finPayment)
      .where(whereExpr ?? sql`true`)
      .orderBy(desc(finPayment.paymentDate), desc(finPayment.createdAt))
      .limit(opts.pageSize)
      .offset(offset),
  ]);
  return { rows, total: totalResult[0]?.count ?? 0 };
}

export async function getFinPaymentById(id: string) {
  const [row] = await db.select().from(finPayment).where(eq(finPayment.id, id)).limit(1);
  return row ?? null;
}

export async function getPaymentAllocations(paymentId: string) {
  return db
    .select()
    .from(finPaymentAllocation)
    .where(eq(finPaymentAllocation.paymentId, paymentId));
}

export interface CreatePaymentResult {
  payment: typeof finPayment.$inferSelect;
  allocations: Array<typeof finPaymentAllocation.$inferSelect>;
}

/**
 * Hàm QUAN TRỌNG NHẤT của phân hệ Tài chính — tạo 1 đợt thanh toán kèm N
 * allocation cho N hoá đơn, trong ĐÚNG 1 transaction Drizzle:
 *   (a) validate SUM(allocations) === totalAmount (đã zod refine ở
 *       finPaymentCreateSchema, nhưng repo VẪN phòng thủ lại — không tin
 *       tưởng mù input đã qua validate ở tầng trên, đề phòng gọi thẳng repo).
 *   (b) validate mỗi allocation không vượt số còn nợ của hoá đơn đó.
 *   (c) insert fin_payment (mã TT-{yymm}-{seq} qua genDocNo).
 *   (d) insert N fin_payment_allocation.
 *   (e) insert ĐÚNG 1 fin_transaction cho MỖI allocation, paymentId trỏ về
 *       payment vừa tạo — đây là dòng tiền thật, cầu nối "payment có hoá đơn
 *       cũng phải xuất hiện trong sổ giao dịch hàng ngày" (xem BẤT BIẾN ở
 *       đầu file).
 *   (f) gọi recalcInvoicePaidAmount cho từng hoá đơn bị ảnh hưởng (dedupe nếu
 *       nhiều allocation cùng invoice trong 1 payment — hiếm, nhưng an toàn).
 * Trigger `fin_account_recalc_balance` tự chạy khi (e) commit.
 */
export async function createPaymentWithAllocations(
  input: FinPaymentCreate,
  actorId: string | null,
): Promise<CreatePaymentResult> {
  return db.transaction(async (tx) => {
    // (a) Phòng thủ lại — KHÔNG tin tưởng mù zod đã chạy ở route.
    const allocSum = input.allocations.reduce((acc, a) => acc + a.amount, 0);
    if (Math.abs(allocSum - input.totalAmount) > 1) {
      throw new Error("FIN_PAYMENT_ALLOCATION_SUM_MISMATCH");
    }

    // (b) Validate từng allocation không vượt số còn nợ — lock hàng invoice
    // bằng FOR UPDATE để 2 payment đồng thời cho cùng invoice không vượt nợ.
    const invoiceIds = [...new Set(input.allocations.map((a) => a.invoiceId))];
    const invoiceRows = await tx
      .select({
        id: finInvoice.id,
        totalAmount: finInvoice.totalAmount,
        paidAmount: finInvoice.paidAmount,
        status: finInvoice.status,
      })
      .from(finInvoice)
      .where(inArray(finInvoice.id, invoiceIds))
      .for("update");

    const invoiceMap = new Map(invoiceRows.map((r) => [r.id, r]));
    // Gộp allocation cùng invoiceId (hiếm nhưng có thể xảy ra) để validate đúng.
    const allocByInvoice = new Map<string, number>();
    for (const a of input.allocations) {
      allocByInvoice.set(a.invoiceId, (allocByInvoice.get(a.invoiceId) ?? 0) + a.amount);
    }
    for (const [invoiceId, allocAmount] of allocByInvoice) {
      const invoiceRow = invoiceMap.get(invoiceId);
      if (!invoiceRow) throw new Error(`FIN_INVOICE_NOT_FOUND:${invoiceId}`);
      if (invoiceRow.status === "CANCELLED") {
        throw new Error(`FIN_INVOICE_CANCELLED:${invoiceId}`);
      }
      const remaining = Number(invoiceRow.totalAmount) - Number(invoiceRow.paidAmount);
      if (allocAmount - remaining > 1) {
        throw new Error(`FIN_PAYMENT_ALLOCATION_EXCEEDS_REMAINING:${invoiceId}`);
      }
    }

    // (c) Sinh mã TT-{yymm}-{seq}.
    const code = await genDocNo(tx, {
      table: "app.fin_payment",
      column: "code",
      prefix: `TT-${currentYymm()}`,
      // Mã `TT-2609-0001` có 3 phần, seq ở phần 3 (xem ghi chú finTransactions).
      seqPart: 3,
      pad: 4,
    });

    const [payment] = await tx
      .insert(finPayment)
      .values({
        code,
        direction: input.direction,
        accountId: input.accountId,
        supplierId: input.supplierId ?? null,
        paymentDate: input.paymentDate.toISOString().slice(0, 10),
        totalAmount: String(input.totalAmount),
        method: input.method ?? "BANK_TRANSFER",
        referenceNo: input.referenceNo ?? null,
        notes: input.notes ?? null,
        createdBy: actorId,
      })
      .returning();
    if (!payment) throw new Error("FIN_PAYMENT_INSERT_FAILED");

    // (d) Insert N fin_payment_allocation (bulk insert 1 câu lệnh).
    const allocations = await tx
      .insert(finPaymentAllocation)
      .values(
        input.allocations.map((a) => ({
          paymentId: payment.id,
          invoiceId: a.invoiceId,
          amount: String(a.amount),
        })),
      )
      .returning();

    // (e) Insert ĐÚNG 1 fin_transaction cho MỖI allocation — KHÔNG ĐƯỢC BỎ
    // BƯỚC NÀY (xem BẤT BIẾN đầu file). Mỗi transaction trỏ paymentId về
    // payment vừa tạo và invoiceId về hoá đơn tương ứng.
    const paymentDateStr = input.paymentDate.toISOString().slice(0, 10);
    const transactionCodes: string[] = [];
    for (const alloc of input.allocations) {
      const txCode = await genDocNo(tx, {
        table: "app.fin_transaction",
        column: "code",
        prefix: `${input.direction === "IN" ? "PT" : "PC"}-${currentYymm()}`,
        // Mã `PC-2609-0001` có 3 phần, seq ở phần 3.
        seqPart: 3,
        pad: 4,
      });
      transactionCodes.push(txCode);
      await tx.insert(finTransaction).values({
        code: txCode,
        direction: input.direction,
        accountId: input.accountId,
        amount: String(alloc.amount),
        transactionDate: paymentDateStr,
        description: input.notes ?? null,
        counterpartyType: input.supplierId ? "SUPPLIER" : null,
        supplierId: input.supplierId ?? null,
        invoiceId: alloc.invoiceId,
        paymentId: payment.id,
        status: "POSTED",
        createdBy: actorId,
      });
    }

    // (f) Recalc paidAmount/status cho từng hoá đơn bị ảnh hưởng (dedupe).
    for (const invoiceId of allocByInvoice.keys()) {
      await recalcInvoicePaidAmount(tx, invoiceId);
    }

    return { payment, allocations };
  });
}

/**
 * Xoá/huỷ payment: rollback allocations + recalc invoice + void transaction
 * tương ứng. Giữ payment row (không xoá cứng) để giữ audit trail — chỉ set
 * transaction liên quan sang VOID và xoá allocation (payment mất hiệu lực).
 */
export async function voidPaymentWithAllocations(paymentId: string) {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(finPayment)
      .where(eq(finPayment.id, paymentId))
      .limit(1);
    if (!payment) throw new Error("FIN_PAYMENT_NOT_FOUND");

    const allocations = await tx
      .select()
      .from(finPaymentAllocation)
      .where(eq(finPaymentAllocation.paymentId, paymentId));
    const invoiceIds = [...new Set(allocations.map((a) => a.invoiceId))];

    // Void toàn bộ fin_transaction sinh ra từ payment này — trigger tự trừ
    // lại balance vì chỉ SUM status='POSTED'.
    await tx
      .update(finTransaction)
      .set({ status: "VOID", updatedAt: new Date() })
      .where(eq(finTransaction.paymentId, paymentId));

    // Xoá allocation (cascade từ payment nếu xoá payment, nhưng ở đây ta giữ
    // payment row nên xoá allocation tường minh) rồi recalc từng invoice.
    await tx.delete(finPaymentAllocation).where(eq(finPaymentAllocation.paymentId, paymentId));

    for (const invoiceId of invoiceIds) {
      await recalcInvoicePaidAmount(tx, invoiceId);
    }

    return { paymentId, voidedInvoiceIds: invoiceIds };
  });
}
