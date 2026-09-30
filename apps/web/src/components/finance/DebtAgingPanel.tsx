"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtVND } from "@/components/finance/_format";
import type { AgingBucket, PartnerAging } from "@/hooks/useFinance";
import { cn } from "@/lib/utils";

/**
 * TASK-20260922 — Panel dùng chung cho 1 CHIỀU công nợ (phải thu hoặc phải
 * trả): KPI tổng + bucket tuổi nợ + bảng chi tiết theo đối tác. Tách khỏi
 * `ReceivablesTab.tsx` (cũ, hard-code OUT) để tái dùng cho cả `direction=IN`
 * (phải trả) — tránh lặp JSX 2 lần (DRY).
 */

const BUCKET_DEF: Array<{ key: AgingBucket["bucket"]; label: string; icon: React.ElementType; accent: string }> = [
  { key: "CURRENT", label: "Trong hạn",     icon: CheckCircle2, accent: "emerald" },
  { key: "1-30",    label: "Quá hạn 1-30 ngày",  icon: Clock,        accent: "amber" },
  { key: "31-60",   label: "Quá hạn 31-60 ngày", icon: Clock,        accent: "amber" },
  { key: "61-90",   label: "Quá hạn 61-90 ngày", icon: AlertCircle,  accent: "red" },
  { key: "90+",     label: "Quá hạn > 90 ngày",  icon: AlertCircle,  accent: "red" },
];

const ACCENT_CLS: Record<string, { card: string; icon: string; value: string }> = {
  emerald: {
    card: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400",
    value: "text-emerald-900 dark:text-emerald-200",
  },
  amber: {
    card: "border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/40",
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
    value: "text-amber-900 dark:text-amber-200",
  },
  red: {
    card: "border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/40",
    icon: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",
    value: "text-red-900 dark:text-red-200",
  },
};

export function DebtAgingPanel({
  buckets,
  partners,
  isLoading,
  emptyTitle,
  emptyDescription,
  kpiLabel,
  partnerColumnLabel,
  onPartnerClick,
  isError,
  error,
  onRetry,
  retrying,
  partnersError,
  onRetryPartners,
}: {
  buckets: AgingBucket[];
  partners: PartnerAging[];
  isLoading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  kpiLabel: string;
  partnerColumnLabel: string;
  /** Click 1 dòng đối tác — chỉ khả dụng khi có invoice cụ thể để mở (V1: không mở gì nếu không truyền). */
  onPartnerClick?: (partner: PartnerAging) => void;
  /** V4.1 UI-05: query buckets lỗi → khối lỗi, KHÔNG hiện "Không có công nợ". */
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  /** V4.1 UI-05: lỗi riêng của query theo đối tác (bảng chi tiết). */
  partnersError?: unknown;
  onRetryPartners?: () => void;
}) {
  const bucketMap = new Map(buckets.map((b) => [b.bucket, b]));

  const totalOutstanding = buckets.reduce((s, b) => s + b.outstandingAmount, 0);
  const totalInvoices = buckets.reduce((s, b) => s + b.invoiceCount, 0);
  const overdueAmount = buckets
    .filter((b) => b.bucket !== "CURRENT")
    .reduce((s, b) => s + b.outstandingAmount, 0);

  const isEmpty = !isLoading && !isError && buckets.length === 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (isError && buckets.length === 0) {
    return (
      <QueryError
        error={error}
        onRetry={onRetry}
        retrying={retrying}
        title="Không tải được dữ liệu công nợ"
      />
    );
  }

  if (isEmpty) {
    return <EmptyState preset="empty-success" title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-6">
      {/* KPI tổng quan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <TrendingUp className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">{kpiLabel}</p>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{fmtVND(totalOutstanding)}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{totalInvoices} hoá đơn</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-800 dark:bg-red-950/40">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">Đã quá hạn</p>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-red-900 dark:text-red-200">{fmtVND(overdueAmount)}</p>
          <p className="text-xs text-red-500/80 dark:text-red-400/80">
            {totalOutstanding > 0 ? Math.round((overdueAmount / totalOutstanding) * 100) : 0}% tổng công nợ
          </p>
        </div>
      </div>

      {/* Bucket breakdown — desktop: 5 thẻ; mobile: thanh tỷ trọng + danh sách gọn (§1.9 P0) */}
      <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-5">
        {BUCKET_DEF.map((def) => {
          const b = bucketMap.get(def.key);
          const cls = ACCENT_CLS[def.accent]!;
          const Icon = def.icon;
          return (
            <div key={def.key} className={cn("rounded-xl border p-4", cls.card)}>
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", cls.icon)}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{def.label}</p>
              <p className={cn("mt-1 text-lg font-bold tabular-nums", cls.value)}>
                {fmtVND(b?.outstandingAmount ?? 0)}
              </p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{b?.invoiceCount ?? 0} hoá đơn</p>
            </div>
          );
        })}
      </div>

      {/* Bar tổng hợp trực quan + danh sách bucket gọn (mobile thay 5 thẻ to) */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <p className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Tỷ trọng theo tuổi nợ</p>
        <div className="flex h-6 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          {BUCKET_DEF.map((def) => {
            const b = bucketMap.get(def.key);
            const pct = totalOutstanding > 0 ? ((b?.outstandingAmount ?? 0) / totalOutstanding) * 100 : 0;
            if (pct <= 0) return null;
            const barColor =
              def.accent === "emerald" ? "bg-emerald-500" : def.accent === "amber" ? "bg-amber-500" : "bg-red-500";
            return (
              <div
                key={def.key}
                className={cn("h-full transition-all", barColor)}
                style={{ width: `${pct}%` }}
                title={`${def.label}: ${fmtVND(b?.outstandingAmount ?? 0)}`}
              />
            );
          })}
        </div>
        <div className="mt-3 hidden flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400 sm:flex">
          {BUCKET_DEF.map((def) => (
            <span key={def.key} className="inline-flex items-center gap-1.5">
              <span className={cn(
                "h-2 w-2 rounded-full",
                def.accent === "emerald" ? "bg-emerald-500" : def.accent === "amber" ? "bg-amber-500" : "bg-red-500",
              )} />
              {def.label}
            </span>
          ))}
        </div>
        {/* Mobile: danh sách hàng gọn thay 5 thẻ to xếp dọc (§1.9 P0) */}
        <ul className="mt-3 divide-y divide-zinc-100 sm:hidden dark:divide-zinc-800">
          {BUCKET_DEF.map((def) => {
            const b = bucketMap.get(def.key);
            const dotColor =
              def.accent === "emerald" ? "bg-emerald-500" : def.accent === "amber" ? "bg-amber-500" : "bg-red-500";
            return (
              <li key={def.key} className="flex items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)} aria-hidden />
                  <span className="truncate">{def.label}</span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {fmtVND(b?.outstandingAmount ?? 0)}
                  </span>
                  <span className="ml-1.5 text-zinc-400 dark:text-zinc-500">({b?.invoiceCount ?? 0})</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Chi tiết theo đối tác — "nợ ai bao nhiêu" */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800 sm:px-5">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Chi tiết theo {partnerColumnLabel.toLowerCase()}</p>
        </div>
        {partnersError && partners.length === 0 ? (
          <QueryError
            compact
            className="m-4"
            error={partnersError}
            onRetry={onRetryPartners}
            title="Không tải được chi tiết theo đối tác"
          />
        ) : partners.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">Chưa có dữ liệu.</p>
        ) : (
          <>
            {/* Desktop: bảng — theo §12.4 design-guidelines, toggle ở div wrapper */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-5 py-2.5">{partnerColumnLabel}</th>
                    <th className="px-5 py-2.5 text-right">Số hoá đơn</th>
                    <th className="px-5 py-2.5 text-right">Còn nợ</th>
                    <th className="px-5 py-2.5 text-right">Quá hạn nhiều nhất</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p, i) => (
                    <tr
                      key={p.partnerId ?? `${p.partnerName}-${i}`}
                      onClick={onPartnerClick ? () => onPartnerClick(p) : undefined}
                      className={cn(
                        "border-b border-zinc-50 last:border-0 dark:border-zinc-800/60",
                        onPartnerClick && "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                      )}
                    >
                      <td className="max-w-[20rem] truncate px-5 py-2.5 font-medium text-zinc-800 dark:text-zinc-200" title={p.partnerName}>{p.partnerName}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{p.invoiceCount}</td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                        {fmtVND(p.outstandingAmount)}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {p.maxOverdueDays > 0 ? (
                          <span className="text-red-600 dark:text-red-400">{p.maxOverdueDays} ngày</span>
                        ) : (
                          <span className="text-zinc-400 dark:text-zinc-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: card-list (§12.4 bắt buộc — trước đây vỡ hoàn toàn trên 390px) */}
            <ul className="space-y-2 p-3 md:hidden">
              {partners.map((p, i) => (
                <li key={p.partnerId ?? `${p.partnerName}-${i}`}>
                  <div
                    role={onPartnerClick ? "button" : undefined}
                    tabIndex={onPartnerClick ? 0 : undefined}
                    onClick={onPartnerClick ? () => onPartnerClick(p) : undefined}
                    onKeyDown={
                      onPartnerClick
                        ? (e) => { if (e.key === "Enter") onPartnerClick(p); }
                        : undefined
                    }
                    className={cn(
                      "rounded-xl p-3",
                      // V4.4 (UI_INVENTORY.md §6) — `.card-interactive` dùng
                      // chung (globals.css) đã vá xong cú pháp ambiguous cũ;
                      // dùng lại thay vì tự viết trùng hover ở đây (tránh 2 nơi
                      // định nghĩa cùng 1 hiệu ứng trôi lệch nhau về sau).
                      onPartnerClick
                        ? "card-interactive cursor-pointer"
                        : "border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200" title={p.partnerName}>
                        {p.partnerName}
                      </p>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                        {fmtVND(p.outstandingAmount)}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{p.invoiceCount} hoá đơn</span>
                      {p.maxOverdueDays > 0 ? (
                        <span className="font-medium text-red-600 dark:text-red-400">{p.maxOverdueDays} ngày quá hạn</span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">Chưa quá hạn</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
