import { and, desc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import { finPlannedIncome, supplier, finCategory } from "@iot/db/schema";
import type { FinPlannedIncomeCreate, FinPlannedIncomeUpdate } from "@iot/shared";
import { db } from "@/lib/db";
import { isoDateVN } from "@/lib/finance";

/**
 * Repo `fin_planned_income` — "Khoản thu dự kiến" nhập tay cho ô "Dự trù thu"
 * Tổng quan Tài chính. KHÔNG gắn hoá đơn bán — khác công nợ phải thu
 * (`getReceivablesRawForBucketing`) + Bảng sản xuất. Đánh dấu "Đã thu" chỉ đổi
 * `status`; phiếu thu thật (`fin_transaction` IN) tạo ở UI.
 */

export async function listFinPlannedIncomes(opts: { status?: string }) {
  const where: SQL[] = [];
  if (opts.status) where.push(eq(finPlannedIncome.status, opts.status));
  const whereExpr = where.length > 0 ? and(...where) : undefined;

  const rows = await db
    .select({
      ...getTableColumns(finPlannedIncome),
      customerName: supplier.name,
      categoryName: finCategory.name,
    })
    .from(finPlannedIncome)
    .leftJoin(supplier, eq(supplier.id, finPlannedIncome.customerId))
    .leftJoin(finCategory, eq(finCategory.id, finPlannedIncome.categoryId))
    .where(whereExpr ?? sql`true`)
    .orderBy(desc(finPlannedIncome.dueDate));
  return rows;
}

/** Khoản OPEN (chưa thu) — số tiền + hạn dự kiến, đưa vào hàm thuần lọc theo kỳ. */
export async function getOpenPlannedIncomeItems(): Promise<Array<{ amount: number; dueDate: string }>> {
  const rows = await db
    .select({ amount: finPlannedIncome.amount, dueDate: finPlannedIncome.dueDate })
    .from(finPlannedIncome)
    .where(eq(finPlannedIncome.status, "OPEN"));
  return rows.map((r) => ({ amount: Number(r.amount) || 0, dueDate: r.dueDate }));
}

export async function getFinPlannedIncomeById(id: string) {
  const [row] = await db
    .select({
      ...getTableColumns(finPlannedIncome),
      customerName: supplier.name,
      categoryName: finCategory.name,
    })
    .from(finPlannedIncome)
    .leftJoin(supplier, eq(supplier.id, finPlannedIncome.customerId))
    .leftJoin(finCategory, eq(finCategory.id, finPlannedIncome.categoryId))
    .where(eq(finPlannedIncome.id, id))
    .limit(1);
  return row ?? null;
}

export async function createFinPlannedIncome(
  input: FinPlannedIncomeCreate,
  actorId: string | null,
) {
  const [row] = await db
    .insert(finPlannedIncome)
    .values({
      description: input.description,
      amount: String(input.amount),
      dueDate: isoDateVN(input.dueDate),
      categoryId: input.categoryId ?? null,
      customerId: input.customerId ?? null,
      accountId: input.accountId ?? null,
      notes: input.notes ?? null,
      createdBy: actorId,
    })
    .returning();
  return row;
}

export async function updateFinPlannedIncome(id: string, input: FinPlannedIncomeUpdate) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.description !== undefined) patch.description = input.description;
  if (input.amount !== undefined) patch.amount = String(input.amount);
  if (input.dueDate !== undefined) patch.dueDate = isoDateVN(input.dueDate);
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  if (input.customerId !== undefined) patch.customerId = input.customerId;
  if (input.accountId !== undefined) patch.accountId = input.accountId;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.status !== undefined) patch.status = input.status;

  const [row] = await db
    .update(finPlannedIncome)
    .set(patch)
    .where(eq(finPlannedIncome.id, id))
    .returning();
  return row ?? null;
}

export async function deleteFinPlannedIncome(id: string) {
  const [row] = await db
    .delete(finPlannedIncome)
    .where(eq(finPlannedIncome.id, id))
    .returning({ id: finPlannedIncome.id });
  return row ?? null;
}

