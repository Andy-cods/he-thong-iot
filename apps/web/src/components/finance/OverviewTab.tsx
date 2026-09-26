"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Landmark,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CashflowChart } from "@/components/finance/CashflowChart";
import { fmtVND, fmtVNDShort, toDateInputValue } from "@/components/finance/_format";
import { useFinCashflow, useFinSummary } from "@/hooks/useFinance";
import { cn } from "@/lib/utils";

/**
 * Tab "Tổng quan" — KPI (thu/chi/chênh lệch/công nợ/số dư) + biểu đồ dòng
 * tiền theo ngày + so sánh tăng trưởng kỳ này vs kỳ trước. Cho chọn khoảng
 * thời gian (mặc định 30 ngày gần nhất theo API).
 */

const RANGE_PRESETS = [
  { key: "7", label: "7 ngày", days: 7 },
  { key: "30", label: "30 ngày", days: 30 },
  { key: "90", label: "90 ngày", days: 90 },
] as const;

export function OverviewTab() {
  const [rangeDays, setRangeDays] = React.useState<7 | 30 | 90>(30);
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");

  const { from, to } = React.useMemo(() => {
    if (customFrom && customTo) return { from: customFrom, to: customTo };
    // V4.1 TC-13 — mốc ngày theo giờ VN.
    const today = new Date();
    const start = new Date(today.getTime() - (rangeDays - 1) * 24 * 60 * 60 * 1000);
    return { from: toDateInputValue(start), to: toDateInputValue(today) };
  }, [rangeDays, customFrom, customTo]);

  const cashflowQuery = useFinCashflow({ from, to, compareWith: "previous_period" });
  const summaryQuery = useFinSummary();

  const cashflow = cashflowQuery.data?.data;
  const summary = summaryQuery.data?.data;
  // TASK-20260922 — totalReceivable/totalPayable lấy trực tiếp từ dashboard
  // summary (đã bổ sung server-side) thay vì gọi lại API aging riêng.
  const totalReceivable = summary?.totalReceivable ?? 0;
  const totalPayable = summary?.totalPayable ?? 0;

  const isLoading = cashflowQuery.isLoading || summaryQuery.isLoading;
  const hasData = (cashflow?.series.length ?? 0) > 0;

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 dark:bg-zinc-950/30">
      <header className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Bộ phận Thu mua", href: "/sales" },
              { label: "Tài chính: Tổng quan" },
            ]}
          />
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Tổng quan Tài chính
          </h1>
        </div>

        {/* Date range picker */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {RANGE_PRESETS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={!customFrom && rangeDays === p.days ? "default" : "outline"}
                onClick={() => {
                  setRangeDays(p.days);
                  setCustomFrom("");
                  setCustomTo("");
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span>Từ</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span>Đến</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
            </div>
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <KpiCard
                icon={TrendingUp}
                label="Tổng thu"
                amount={cashflow?.summary.totalIn ?? 0}
                growth={cashflow?.growth?.inPct}
                accent="emerald"
              />
              <KpiCard
                icon={TrendingDown}
                label="Tổng chi"
                amount={cashflow?.summary.totalOut ?? 0}
                growth={cashflow?.growth?.outPct}
                growthInverse
                accent="rose"
              />
              <KpiCard
                icon={BarChart3}
                label="Chênh lệch"
                amount={cashflow?.summary.netCashflow ?? 0}
                accent={(cashflow?.summary.netCashflow ?? 0) >= 0 ? "indigo" : "rose"}
              />
              <KpiCard
                icon={ReceiptText}
                label="Công nợ phải thu"
                amount={totalReceivable}
                accent="amber"
              />
              <KpiCard
                icon={ReceiptText}
                label="Công nợ phải trả"
                amount={totalPayable}
                accent="rose"
              />
              <KpiCard
                icon={Landmark}
                label="Số dư tài khoản"
                amount={summary?.totalBalance ?? 0}
                accent="zinc"
              />
            </div>

            {/* Chart */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    Dòng tiền theo ngày
                  </p>
                </div>
                {cashflow?.growth && (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <GrowthPill label="Thu" pct={cashflow.growth.inPct} />
                    <GrowthPill label="Chi" pct={cashflow.growth.outPct} inverse />
                    <span>{cashflow.growth.vsLabel}</span>
                  </div>
                )}
              </div>
              {!hasData ? (
                <EmptyState preset="no-data" title="Chưa có dữ liệu dòng tiền" description="Chưa có giao dịch nào trong khoảng thời gian đã chọn." />
              ) : (
                <CashflowChart data={cashflow!.series} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  amount,
  growth,
  growthInverse,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  /** V4.1 (UI) — thẻ KPI hiện số rút gọn (dấu phẩy) + số đủ ngay bên dưới. */
  amount: number;
  growth?: number;
  growthInverse?: boolean;
  accent: "emerald" | "rose" | "indigo" | "amber" | "zinc";
}) {
  const map = {
    emerald: { card: "bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800", icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400", value: "text-emerald-900 dark:text-emerald-200" },
    rose:    { card: "bg-rose-50/60 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800",       icon: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400",       value: "text-rose-900 dark:text-rose-200" },
    indigo:  { card: "bg-indigo-50/60 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800", icon: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400", value: "text-indigo-900 dark:text-indigo-200" },
    amber:   { card: "bg-amber-50/60 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800",   icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",   value: "text-amber-900 dark:text-amber-200" },
    zinc:    { card: "bg-white border-zinc-200 dark:bg-zinc-900 dark:border-zinc-700",              icon: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",         value: "text-zinc-900 dark:text-zinc-50" },
  };
  const s = map[accent];
  const isGood = growth !== undefined && (growthInverse ? growth <= 0 : growth >= 0);

  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", s.card)}>
      <div className="flex items-start justify-between gap-2">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", s.icon)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        {growth !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              isGood
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
            )}
          >
            {growth >= 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
            {Math.abs(growth).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={cn("mt-0.5 font-mono text-xl font-bold tabular-nums", s.value)} title={fmtVND(amount)}>
        {fmtVNDShort(amount)}
      </p>
      <p className="truncate text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">{fmtVND(amount)}</p>
    </div>
  );
}

function GrowthPill({ label, pct, inverse }: { label: string; pct: number; inverse?: boolean }) {
  const isGood = inverse ? pct <= 0 : pct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
        isGood
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          : "bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
      )}
    >
      {pct >= 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {label} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
