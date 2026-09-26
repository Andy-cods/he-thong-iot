import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { finAccount } from "@iot/db/schema";
import type { FinAccountCreate, FinAccountType, FinAccountUpdate } from "@iot/shared";
import { db } from "@/lib/db";
import { evaluateSpend, FinSourceError, isoDateVN } from "@/lib/finance";

/** Transaction handle của Drizzle (giống pattern `_docNumber.ts`). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Repo `fin_account` — Tài khoản giao dịch (ngân hàng/tiền mặt) tập trung.
 * `currentBalance` là cột cache do trigger SQL `fin_account_recalc_balance`
 * (migration 0055) tự đồng bộ — repo layer KHÔNG BAO GIỜ update trực tiếp
 * cột này (xem plans/v4-finance/wave-2-finance.md §A.3.1).
 */

export async function listFinAccounts(opts: {
  type?: FinAccountType;
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
        ? isoDateVN(input.openingBalanceDate)
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

/**
 * V4.1 Đợt 3 (Q7) — Khoá nguồn tiền (`SELECT … FOR UPDATE`) rồi kiểm tra 1
 * khoản CHI `amount` từ nguồn này. PHẢI gọi trong transaction TRƯỚC khi insert
 * dòng fin_transaction OUT:
 *   - khoá dòng fin_account → 2 phiếu chi đồng thời cùng nguồn phải xếp hàng,
 *     phiếu sau đọc `current_balance` ĐÃ gồm phiếu trước (trigger 0055 cập nhật
 *     dòng này trong cùng transaction của phiếu trước).
 *   - nguồn ngưng dùng → FIN_ACCOUNT_INACTIVE; vượt số dư mà không có
 *     `allowOverdraft` (chỉ route mới quyết, chỉ admin) → FIN_INSUFFICIENT_BALANCE
 *     "Nguồn chi X chỉ còn Y ₫".
 * Trả về số dư trước/sau để caller ghi audit nếu cần.
 */
export async function lockSpendSource(
  tx: Tx,
  accountId: string,
  amount: number,
  opts: { allowOverdraft?: boolean } = {},
): Promise<{ id: string; name: string; balance: number; balanceAfter: number }> {
  const [acc] = await tx
    .select({
      id: finAccount.id,
      name: finAccount.name,
      currentBalance: finAccount.currentBalance,
      isActive: finAccount.isActive,
    })
    .from(finAccount)
    .where(eq(finAccount.id, accountId))
    .for("update");
  if (!acc) throw new FinSourceError("FIN_ACCOUNT_NOT_FOUND", "Không tìm thấy nguồn tiền.", 404);
  const check = evaluateSpend({
    accountName: acc.name,
    balance: acc.currentBalance,
    amount,
    isActive: acc.isActive,
    allowOverdraft: opts.allowOverdraft,
  });
  if (!check.ok) throw new FinSourceError(check.code, check.message);
  return {
    id: acc.id,
    name: acc.name,
    balance: Number(acc.currentBalance),
    balanceAfter: check.balanceAfter,
  };
}

/**
 * Khoá + kiểm nguồn NHẬN tiền (thu / chân IN chuyển quỹ): chỉ cần tồn tại và
 * đang hoạt động — thu không bao giờ làm âm số dư.
 */
export async function lockReceiveSource(
  tx: Tx,
  accountId: string,
): Promise<{ id: string; name: string }> {
  const [acc] = await tx
    .select({ id: finAccount.id, name: finAccount.name, isActive: finAccount.isActive })
    .from(finAccount)
    .where(eq(finAccount.id, accountId))
    .for("update");
  if (!acc) throw new FinSourceError("FIN_ACCOUNT_NOT_FOUND", "Không tìm thấy nguồn tiền.", 404);
  if (acc.isActive === false) {
    throw new FinSourceError("FIN_ACCOUNT_INACTIVE", `Nguồn "${acc.name}" đã ngưng sử dụng.`);
  }
  return { id: acc.id, name: acc.name };
}
