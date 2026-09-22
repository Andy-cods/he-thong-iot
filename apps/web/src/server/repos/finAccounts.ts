import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { finAccount } from "@iot/db/schema";
import type { FinAccountCreate, FinAccountUpdate } from "@iot/shared";
import { db } from "@/lib/db";

/**
 * Repo `fin_account` — Tài khoản giao dịch (ngân hàng/tiền mặt) tập trung.
 * `currentBalance` là cột cache do trigger SQL `fin_account_recalc_balance`
 * (migration 0055) tự đồng bộ — repo layer KHÔNG BAO GIỜ update trực tiếp
 * cột này (xem plans/v4-finance/wave-2-finance.md §A.3.1).
 */

export async function listFinAccounts(opts: {
  type?: "BANK" | "CASH";
  isActive?: boolean;
  q?: string;
  page: number;
  pageSize: number;
}) {
  const where: SQL[] = [];
  if (opts.type) where.push(eq(finAccount.type, opts.type));
  if (opts.isActive !== undefined) where.push(eq(finAccount.isActive, opts.isActive));
  if (opts.q && opts.q.trim()) {
    const needle = `%${opts.q.trim()}%`;
    const orExpr = or(ilike(finAccount.code, needle), ilike(finAccount.name, needle));
    if (orExpr) where.push(orExpr);
  }
  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const offset = (opts.page - 1) * opts.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(finAccount)
      .where(whereExpr ?? sql`true`),
    db
      .select()
      .from(finAccount)
      .where(whereExpr ?? sql`true`)
      .orderBy(asc(finAccount.code))
      .limit(opts.pageSize)
      .offset(offset),
  ]);
  return { rows, total: totalResult[0]?.count ?? 0 };
}

export async function getFinAccountById(id: string) {
  const [row] = await db.select().from(finAccount).where(eq(finAccount.id, id)).limit(1);
  return row ?? null;
}

export async function getFinAccountByCode(code: string) {
  const [row] = await db
    .select()
    .from(finAccount)
    .where(eq(finAccount.code, code.toUpperCase()))
    .limit(1);
  return row ?? null;
}

export async function createFinAccount(input: FinAccountCreate, actorId: string | null) {
  const [row] = await db
    .insert(finAccount)
    .values({
      code: input.code,
      name: input.name,
      type: input.type,
      bankName: input.bankName ?? null,
      accountNumber: input.accountNumber ?? null,
      openingBalance: String(input.openingBalance ?? 0),
      // opening balance = current balance ban đầu (chưa có giao dịch nào,
      // trigger chỉ chạy khi fin_transaction thay đổi).
      currentBalance: String(input.openingBalance ?? 0),
      openingBalanceDate: input.openingBalanceDate
        ? input.openingBalanceDate.toISOString().slice(0, 10)
        : null,
      createdBy: actorId,
    })
    .returning();
  return row;
}

/**
 * Sửa tài khoản. KHÔNG cho sửa `code`/`openingBalance`/`openingBalanceDate` qua
 * hàm này (đã chặn ở zod `finAccountUpdateSchema.omit`) — nếu tài khoản đã có
 * giao dịch, sửa opening balance sẽ làm sai `currentBalance` do trigger tính
 * lại full re-scan dựa trên `opening_balance + SUM(transaction)`.
 */
export async function updateFinAccount(id: string, input: FinAccountUpdate) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.type !== undefined) patch.type = input.type;
  if (input.bankName !== undefined) patch.bankName = input.bankName;
  if (input.accountNumber !== undefined) patch.accountNumber = input.accountNumber;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  patch.updatedAt = new Date();

  const [row] = await db
    .update(finAccount)
    .set(patch)
    .where(eq(finAccount.id, id))
    .returning();
  return row ?? null;
}

export async function softDeleteFinAccount(id: string) {
  const [row] = await db
    .update(finAccount)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(finAccount.id, id))
    .returning();
  return row ?? null;
}
