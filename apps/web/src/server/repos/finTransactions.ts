import { randomUUID } from "node:crypto";
import {
  and,
  desc,
  eq,
  getTableColumns,
  gte,
  isNotNull,
  isNull,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { finTransaction, supplier } from "@iot/db/schema";
import type { FinTransactionCreate, FinTransactionUpdate, FinTransferCreate } from "@iot/shared";
import { db } from "@/lib/db";
import { buildTransferLegs, isoDateVN } from "@/lib/finance";
import { currentYymm, genDocNo } from "./_docNumber";
import { lockReceiveSource, lockSpendSource } from "./finAccounts";

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
  // V4.1 Đợt 3 (Q7) — chuyển quỹ nội bộ KHÔNG phải thu/chi thật (tiền không ra
  // khỏi công ty) → loại khỏi tổng. Điểm tổng hợp 1/3 (2 điểm còn lại:
  // getCashflowSeries + getCashflowTotals ở finInvoices.ts).
  const transferFilter = sql`AND transfer_group_id IS NULL`;

  const [row] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'IN'  THEN amount ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0) AS total_out,
      COUNT(*)::int AS txn_count
    FROM app.fin_transaction
    WHERE ${whereExpr ?? sql`TRUE`} ${voidFilter} ${transferFilter}
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
    // V4.1 TC-03 — kèm tên đối tác (UI không phải tải danh sách NCC riêng).
    db
      .select({ ...getTableColumns(finTransaction), supplierName: supplier.name })
      .from(finTransaction)
      .leftJoin(supplier, eq(supplier.id, finTransaction.supplierId))
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
  opts: { allowOverdraft?: boolean } = {},
) {
  return db.transaction(async (tx) => {
    // V4.1 Đợt 3 (Q7) — khoá nguồn + chặn chi vượt số dư / nguồn ngưng dùng.
    if (input.direction === "OUT") {
      await lockSpendSource(tx, input.accountId, input.amount, opts);
    } else {
      await lockReceiveSource(tx, input.accountId);
    }
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
        // V4.1 TC-13 — ngày theo giờ VN (form gửi `new Date()` trước 7h sáng
        // từng bị lùi 1 ngày khi cắt chuỗi UTC).
        transactionDate: isoDateVN(input.transactionDate),
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

/**
 * V4.1 Đợt 3 (Q7) — Huỷ CẢ NHÓM chuyển quỹ (2 chân OUT + IN) trong 1 lệnh →
 * trigger hoàn số dư cả 2 nguồn. Trả các dòng đã đổi.
 */
export async function voidTransferGroup(transferGroupId: string) {
  return db
    .update(finTransaction)
    .set({ status: "VOID", updatedAt: new Date() })
    .where(eq(finTransaction.transferGroupId, transferGroupId))
    .returning();
}

/**
 * V4.1 Đợt 3 (Q7) — Chuyển quỹ nội bộ. 1 transaction DB:
 *   1. Khoá 2 nguồn theo thứ tự id (tránh deadlock khi 2 lệnh chuyển ngược
 *      chiều nhau chạy cùng lúc), kiểm nguồn đi đủ số dư (trừ admin override).
 *   2. Mã `CQ-YYMM-NNNN` (genDocNo, an toàn concurrency). Chân OUT mang mã gốc,
 *      chân IN mang `…-N` (vẫn unique, không lọt regex seq của genDocNo).
 *   3. Insert 2 dòng POSTED cùng `transfer_group_id` — trigger 0055 tự trừ nguồn
 *      đi, cộng nguồn nhận.
 */
export async function createTransfer(
  input: FinTransferCreate,
  actorId: string | null,
  opts: { allowOverdraft?: boolean } = {},
) {
  return db.transaction(async (tx) => {
    const lockOrder = [input.fromAccountId, input.toAccountId].sort();
    let fromName = "";
    let toName = "";
    for (const accountId of lockOrder) {
      if (accountId === input.fromAccountId) {
        fromName = (await lockSpendSource(tx, accountId, input.amount, opts)).name;
      } else {
        toName = (await lockReceiveSource(tx, accountId)).name;
      }
    }

    const code = await genDocNo(tx, {
      table: "app.fin_transaction",
      column: "code",
      prefix: `CQ-${currentYymm()}`,
      seqPart: 3,
      pad: 4,
    });
    const transferGroupId = randomUUID();
    const legs = buildTransferLegs(
      {
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        fromAccountName: fromName,
        toAccountName: toName,
        amount: input.amount,
        transactionDate: isoDateVN(input.transactionDate),
        description: input.description,
      },
      code,
      transferGroupId,
    );

    const rows = await tx
      .insert(finTransaction)
      .values(
        legs.map((leg) => ({
          ...leg,
          categoryId: null,
          counterpartyType: null,
          invoiceId: null,
          paymentId: null,
          status: "POSTED" as const,
          createdBy: actorId,
        })),
      )
      .returning();
    if (rows.length !== 2) throw new Error("FIN_TRANSFER_INSERT_FAILED");
    return { transferGroupId, code, legs: rows };
  });
}
