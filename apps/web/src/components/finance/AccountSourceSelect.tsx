"use client";

import * as React from "react";
import { FIN_ACCOUNT_TYPE_LABELS, FIN_ACCOUNT_TYPES } from "@iot/shared";
import { fmtVND } from "@/components/finance/_format";
import type { FinAccountRow } from "@/hooks/useFinance";
import { balanceAfter } from "@/lib/finance";
import { cn } from "@/lib/utils";

/**
 * V4.1 Đợt 3 (Q7) — Ô chọn "Nguồn thu" / "Nguồn chi".
 * - `<optgroup>` theo loại (Quỹ tiền mặt / Ngân hàng / TK chi tiêu), mỗi dòng
 *   hiện số dư: `Quỹ tiền mặt · 12.500.000 ₫`.
 * - Dưới ô: "Số dư sau phiếu: Y ₫" (đỏ nếu âm) khi đã có số tiền.
 * Server vẫn là nơi chặn cuối (khoá nguồn FOR UPDATE → 409).
 */

export function groupAccountsByType(accounts: FinAccountRow[]) {
  return FIN_ACCOUNT_TYPES.map((type) => ({
    type,
    label: FIN_ACCOUNT_TYPE_LABELS[type],
    accounts: accounts.filter((a) => a.type === type),
  })).filter((g) => g.accounts.length > 0);
}

export const selectClassName =
  "mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export const AccountSourceSelect = React.forwardRef<
  HTMLSelectElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
    accounts: FinAccountRow[];
    placeholder?: string;
    /** Loại trừ 1 nguồn (VD chuyển quỹ: nguồn nhận ≠ nguồn đi). */
    excludeId?: string;
  }
>(function AccountSourceSelect({ accounts, placeholder = "— Chọn nguồn —", excludeId, className, ...props }, ref) {
  const groups = groupAccountsByType(accounts.filter((a) => a.id !== excludeId));
  return (
    <select ref={ref} className={cn(selectClassName, className)} {...props}>
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.type} label={g.label}>
          {g.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {fmtVND(a.currentBalance)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
});

/** Dòng "Số dư sau phiếu" dưới ô chọn nguồn. */
export function BalanceAfterHint({
  account,
  direction,
  amount,
}: {
  account: FinAccountRow | undefined;
  direction: "IN" | "OUT";
  amount: number;
}) {
  if (!account) return null;
  const after = balanceAfter(account.currentBalance, direction, amount || 0);
  const negative = after < 0;
  return (
    <p
      className={cn(
        "mt-1 text-xs tabular-nums",
        negative ? "font-semibold text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400",
      )}
    >
      Số dư hiện tại {fmtVND(account.currentBalance)} · Số dư sau phiếu: {fmtVND(after)}
      {negative && " — vượt số dư nguồn"}
    </p>
  );
}
