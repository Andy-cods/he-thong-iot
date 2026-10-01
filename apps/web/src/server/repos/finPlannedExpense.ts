import { and, desc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import { finPlannedExpense, supplier, finCategory } from "@iot/db/schema";
import type { FinPlannedExpenseCreate, FinPlannedExpenseUpdate } from "@iot/shared";
import { db } from "@/lib/db";
import { isoDateVN } from "@/lib/finance";

/**
 * TASK-20261001 — Repo `fin_planned_expense` — "Khoản chi dự kiến" nhập tay
 * cho ô "Dự trù chi" Tổng quan Tài chính (việc 3, phần b). KHÔNG gắn hoá đơn
 * — khác PO chưa HĐ (`getExpectedPayableSummary`) + công nợ phải trả
 * (`getPayablesRawForBucketing`). Đánh dấu "Đã chi" chỉ đổi `status` — việc
 * tạo phiếu chi thật (`fin_transaction`) làm ở UI/route riêng.
 */

export async function listFinPlannedExpenses(opts: { status?: string }) {
  const where: SQL[] = [];
  if (opts.status) where.push(eq(finPlannedExpense.status, opts.status));
  const whereExpr = where.length > 0 ? and(...where) : undefined;

  const rows = await db
    .select({
      ...getTableColumns(finPlannedExpense),
      supplierName: supplier.name,
      categoryName: finCategory.name,
    })
    .from(finPlannedExpense)
    .leftJoin(supplier, eq(supplier.id, finPlannedExpense.supplierId))
    .leftJoin(finCategory, eq(finCategory.id, finPlannedExpense.categoryId))
    .where(whereExpr ?? sql`true`)
    .orderBy(desc(finPlannedExpense.dueDate));
  return rows;
}

/** Danh sách OPEN (chưa chi) — dùng trực tiếp cho công thức "Dự trù chi". */
export async function getOpenPlannedExpenseAmounts(): Promise<number[]> {
  const rows = await db
    .select({ amount: finPlannedExpense.amount })
    .from(finPlannedExpense)
    .where(eq(finPlannedExpense.status, "OPEN"));
  return rows.map((r) => Number(r.amount) || 0);
}

export async function getFinPlannedExpenseById(id: string) {
  const [row] = await db
    .select({
      ...getTableColumns(finPlannedExpense),
      supplierName: supplier.name,
      categoryName: finCategory.name,
    })
    .from(finPlannedExpense)
    .leftJoin(supplier, eq(supplier.id, finPlannedExpense.supplierId))
    .leftJoin(finCategory, eq(finCategory.id, finPlannedExpense.categoryId))
    .where(eq(finPlannedExpense.id, id))
    .limit(1);
  return row ?? null;
}

export async function createFinPlannedExpense(
  input: FinPlannedExpenseCreate,
  actorId: string | null,
) {
  const [row] = await db
    .insert(finPlannedExpense)
    .values({
      description: input.description,
      amount: String(input.amount),
      dueDate: isoDateVN(input.dueDate),
      categoryId: input.categoryId ?? null,
      supplierId: input.supplierId ?? null,
      accountId: input.accountId ?? null,
      notes: input.notes ?? null,
      createdBy: actorId,
    })
    .returning();
  return row;
}

export async function updateFinPlannedExpense(id: string, input: FinPlannedExpenseUpdate) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.description !== undefined) patch.description = input.description;
  if (input.amount !== undefined) patch.amount = String(input.amount);
  if (input.dueDate !== undefined) patch.dueDate = isoDateVN(input.dueDate);
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  if (input.supplierId !== undefined) patch.supplierId = input.supplierId;
  if (input.accountId !== undefined) patch.accountId = input.accountId;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.status !== undefined) patch.status = input.status;

  const [row] = await db
    .update(finPlannedExpense)
    .set(patch)
    .where(eq(finPlannedExpense.id, id))
    .returning();
  return row ?? null;
}

export async function deleteFinPlannedExpense(id: string) {
  const [row] = await db
    .delete(finPlannedExpense)
    .where(eq(finPlannedExpense.id, id))
    .returning({ id: finPlannedExpense.id });
  return row ?? null;
}

