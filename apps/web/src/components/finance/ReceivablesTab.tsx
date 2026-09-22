"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtVND } from "@/components/finance/_format";
import { useReceivablesAging, type AgingBucket } from "@/hooks/useFinance";
import { cn } from "@/lib/utils";

/**
 * Tab "Công nợ" — bucket tuổi nợ phải thu (direction=OUT). Query động, không
 * bảng lưu trữ (§C.1). V1: chỉ tổng theo bucket (không drill-down theo khách
 * hàng — backlog theo plan §C.1, tránh over-engineering).
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

export function ReceivablesTab() {
  const query = useReceivablesAging();
  const buckets = query.data?.data.buckets ?? [];
  const bucketMap = new Map(buckets.map((b) => [b.bucket, b]));

  const totalOutstanding = buckets.reduce((s, b) => s + b.outstandingAmount, 0);
  const totalInvoices = buckets.reduce((s, b) => s + b.invoiceCount, 0);
  const overdueAmount = buckets
    .filter((b) => b.bucket !== "CURRENT")
    .reduce((s, b) => s + b.outstandingAmount, 0);

  const isEmpty = !query.isLoading && buckets.length === 0;

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 dark:bg-zinc-950/30">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <Breadcrumb
          items={[
            { label: "Trang chủ", href: "/" },
            { label: "Tài chính" },
            { label: "Công nợ" },
          ]}
        />
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Công nợ phải thu
        </h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Hoá đơn đầu ra (bán hàng) chưa thu hết tiền, phân theo tuổi nợ
        </p>
      </header>

      <div className="flex-1 p-4 md:p-6">
        {query.isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
            </div>
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : isEmpty ? (
          <EmptyState preset="empty-success" title="Không có công nợ phải thu" description="Tất cả hoá đơn đầu ra đã được thanh toán đầy đủ." />
        ) : (
          <div className="space-y-6">
            {/* KPI tổng quan */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-wider">Tổng phải thu</p>
                </div>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{fmtVND(totalOutstanding)}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">{totalInvoices} hoá đơn</p>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-800 dark:bg-red-950/40">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-wider">Đã quá hạn</p>
                </div>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-red-900 dark:text-red-200">{fmtVND(overdueAmount)}</p>
                <p className="text-xs text-red-500/80 dark:text-red-400/80">
                  {totalOutstanding > 0 ? Math.round((overdueAmount / totalOutstanding) * 100) : 0}% tổng công nợ
                </p>
              </div>
            </div>

            {/* Bucket breakdown */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {BUCKET_DEF.map((def) => {
                const b = bucketMap.get(def.key);
                const cls = ACCENT_CLS[def.accent]!;
                const Icon = def.icon;
                return (
                  <div key={def.key} className={cn("rounded-2xl border p-4", cls.card)}>
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", cls.icon)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{def.label}</p>
                    <p className={cn("mt-1 font-mono text-lg font-bold tabular-nums", cls.value)}>
                      {fmtVND(b?.outstandingAmount ?? 0)}
                    </p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{b?.invoiceCount ?? 0} hoá đơn</p>
                  </div>
                );
              })}
            </div>

            {/* Bar tổng hợp trực quan */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
