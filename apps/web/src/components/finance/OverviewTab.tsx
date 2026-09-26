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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
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
  // V4.1 UI-05: query lỗi → KPI hiện "—" (null) thay vì 0.
  const cashflowFailed = cashflowQuery.isError && !cashflow;
  const summaryFailed = summaryQuery.isError && !summary;

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 dark:bg-zinc-950/30">
      <header className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          {/* V4.1 UI-09 (X6): bỏ breadcrumb thân trang — topbar đã hiện cùng đường dẫn (+ nhãn tab). */}
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
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
                amount={cashflowFailed ? null : (cashflow?.summary.totalIn ?? 0)}
                growth={cashflow?.growth?.inPct}
                accent="emerald"
              />
              <KpiCard
                icon={TrendingDown}
                label="Tổng chi"
                amount={cashflowFailed ? null : (cashflow?.summary.totalOut ?? 0)}
                growth={cashflow?.growth?.outPct}
                growthInverse
                accent="rose"
              />
              <KpiCard
                icon={BarChart3}
                label="Chênh lệch"
                amount={cashflowFailed ? null : (cashflow?.summary.netCashflow ?? 0)}
                accent={(cashflow?.summary.netCashflow ?? 0) >= 0 ? "indigo" : "rose"}
              />
              <KpiCard
                icon={ReceiptText}
                label="Công nợ phải thu"
                amount={summaryFailed ? null : totalReceivable}
                accent="amber"
              />
              <KpiCard
                icon={ReceiptText}
                label="Công nợ phải trả"
                amount={summaryFailed ? null : totalPayable}
                accent="rose"
              />
              <KpiCard
                icon={Landmark}
                label="Số dư tài khoản"
                amount={summaryFailed ? null : (summary?.totalBalance ?? 0)}
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
              {cashflowFailed ? (
                <QueryError
                  error={cashflowQuery.error}
                  onRetry={() => void cashflowQuery.refetch()}
                  retrying={cashflowQuery.isFetching}
                  title="Không tải được dữ liệu dòng tiền"
                />
              ) : !hasData ? (
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
  /** V4.1 (UI) — thẻ KPI hiện số rút gọn (dấu phẩy) + số đủ ngay bên dưới.
   *  V4.1 UI-05: null = không tải được → hiện "—". */
  amount: number | null;
  growth?: number;
  growthInverse?: boolean;
  accent: "emerald" | "rose" | "indigo" | "amber" | "zinc";
}) {
  // V4.1 UI-24 (X8): 6 thẻ 6 màu → thẻ trung tính (trắng, viền zinc, số đen, icon zinc).
  // `accent` chỉ còn là CHẤM nhỏ cạnh nhãn (thu = lục, chi/nợ = hồng, phải trả = amber).
  const dot: Record<typeof accent, string | null> = {
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    amber: "bg-amber-500",
    indigo: null,
    zinc: null,
  };
  const accentDot = dot[accent];
  const isGood = growth !== undefined && (growthInverse ? growth <= 0 : growth >= 0);

  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
          <p className="truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
          {accentDot ? <span className={cn("h-2 w-2 shrink-0 rounded-full", accentDot)} aria-hidden /> : null}
        </div>
        {growth !== undefined && (
          <span
            className={cn(
              "inline-flex whitespace-nowrap items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
              isGood
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
            )}
          >
            {growth >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(growth).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50" title={amount === null ? undefined : fmtVND(amount)}>
        {amount === null ? "—" : fmtVNDShort(amount)}
      </p>
      {/* Dòng phụ = số đủ — chỉ hiện khi khác số rút gọn (trước lặp "0 ₫" 2 lần). */}
      {amount === null ? (
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">Không tải được</p>
      ) : fmtVND(amount) !== fmtVNDShort(amount) ? (
        <p className="truncate text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{fmtVND(amount)}</p>
      ) : null}
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
