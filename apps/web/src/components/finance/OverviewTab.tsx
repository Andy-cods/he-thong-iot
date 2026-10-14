"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ClipboardList,
  Landmark,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { DateField } from "@/components/ui/date-field";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { CashflowChart } from "@/components/finance/CashflowChart";
import { ExpectedExpenseSheet } from "@/components/finance/ExpectedExpenseSheet";
import { ExpectedIncomeSheet } from "@/components/finance/ExpectedIncomeSheet";
import { fmtVND, fmtVNDShort, toDateInputValue } from "@/components/finance/_format";
import { useFinCashflow, useFinSummary, type CashflowPoint } from "@/hooks/useFinance";
import { useSession } from "@/hooks/useSession";
import { HORIZON_OPTIONS, parseHorizon } from "@/lib/finance-overview-policy";
import { isRouteAllowed } from "@/lib/route-guard";
import { cn } from "@/lib/utils";

/**
 * Tab "Tổng quan" — thiết kế lại V4.7 theo hướng Apple: thang bậc rõ (hero →
 * kế hoạch → số thực → biểu đồ), thẻ bo tròn mềm (rounded-2xl), bóng rất nhẹ,
 * khoảng thở rộng, số tabular-nums. Nguồn "Dự trù thu" nay là ĐƠN HÀNG BÁN
 * (sales_order) thay cho Bảng sản xuất TV.
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
    const today = new Date();
    const start = new Date(today.getTime() - (rangeDays - 1) * 24 * 60 * 60 * 1000);
    return { from: toDateInputValue(start), to: toDateInputValue(today) };
  }, [rangeDays, customFrom, customTo]);

  const cashflowQuery = useFinCashflow({ from, to, compareWith: "previous_period" });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const horizon = parseHorizon(searchParams.get("horizon"));
  const setHorizon = (h: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("horizon", String(h));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const summaryQuery = useFinSummary(horizon);
  const session = useSession();
  const roles = session.data?.roles;
  // V4.7 — "Dự trù thu" nguồn từ Đơn hàng bán; đơn quản lý trong BOM workspace.
  // Link "xem đơn" chỉ hiện khi user vào được /bom.
  const canOpenOrders = isRouteAllowed("/bom", roles ?? []);
  const [expenseDetailOpen, setExpenseDetailOpen] = React.useState(false);
  const [incomeDetailOpen, setIncomeDetailOpen] = React.useState(false);

  const cashflow = cashflowQuery.data?.data;
  const summary = summaryQuery.data?.data;
  const totalReceivable = summary?.totalReceivable ?? 0;
  const totalPayable = summary?.totalPayable ?? 0;
  const orders = summary?.orders;
  const expectedPayable = summary?.expectedPayable;
  const expectedReceivable = summary?.expectedReceivable;
  const missingPriceCount = orders?.missingPriceCount ?? 0;
  const abnormalCount = orders?.abnormalCount ?? 0;

  const isLoading = cashflowQuery.isLoading || summaryQuery.isLoading;
  const hasData = (cashflow?.series.length ?? 0) > 0;
  const cashflowFailed = cashflowQuery.isError && !cashflow;
  const summaryFailed = summaryQuery.isError && !summary;

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/60 dark:bg-zinc-950/40">
      <header className="sticky top-0 z-10 flex flex-col gap-4 border-b border-zinc-200/70 bg-white/80 px-5 py-5 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-900/70 md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
            Tài chính · Kế toán
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-[28px]">
            Tổng quan
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={customFrom ? "" : String(rangeDays)}
            onValueChange={(v) => {
              setRangeDays(Number(v) as 7 | 30 | 90);
              setCustomFrom("");
              setCustomTo("");
            }}
          >
            <TabsList variant="segmented">
              {RANGE_PRESETS.map((p) => (
                <TabsTrigger key={p.key} value={p.key}>
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span>Từ</span>
            <DateField value={customFrom} onChange={setCustomFrom} aria-label="Từ ngày" className="w-32" />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span>Đến</span>
            <DateField value={customTo} onChange={setCustomTo} aria-label="Đến ngày" className="w-32" />
          </label>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1400px] flex-1 p-5 md:p-8">
        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-32 rounded-2xl" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
            </div>
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Hero — chênh lệch thu–chi */}
            <HeroKpi
              label="Chênh lệch thu–chi kỳ này"
              amount={cashflowFailed ? null : (cashflow?.summary.netCashflow ?? 0)}
              series={cashflow?.series}
            />

            {/* Kế hoạch (dự trù) */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <SectionLabel>Kế hoạch · dự trù (chưa phát sinh dòng tiền)</SectionLabel>
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Kỳ dự trù</span>
                  <Tabs value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
                    <TabsList variant="segmented">
                      {HORIZON_OPTIONS.map((h) => (
                        <TabsTrigger key={h} value={String(h)}>
                          {h} ngày
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <PlanKpiCard
                  icon={ClipboardList}
                  tone="emerald"
                  label={`Dự trù thu · ${horizon} ngày tới`}
                  amount={summaryFailed ? null : (expectedReceivable?.value ?? 0)}
                  sub={
                    expectedReceivable
                      ? `Đơn hàng ${fmtVND(expectedReceivable.orderValue)} · Phải thu ${fmtVND(expectedReceivable.receivableDue)} · Thu dự kiến ${fmtVND(expectedReceivable.plannedIncomeValue)}`
                      : undefined
                  }
                  tooltip={`Σ giá trị ĐƠN HÀNG BÁN đang sản xuất chưa giao (SL × đơn giá bán, trạng thái Đã xác nhận/Đã chốt BOM/Đang SX) + công nợ phải thu quá hạn và đến hạn trong ${horizon} ngày tới + khoản thu dự kiến chưa thu có hạn ≤ ${horizon} ngày tới. Bấm "Chi tiết" để xem theo khách hàng.`}
                  action={{ label: "Chi tiết", onClick: () => setIncomeDetailOpen(true) }}
                />
                <PlanKpiCard
                  icon={Wallet}
                  tone="rose"
                  label={`Dự trù chi · ${horizon} ngày tới`}
                  amount={summaryFailed ? null : (expectedPayable?.value ?? 0)}
                  sub={
                    expectedPayable
                      ? `Công nợ ≤${horizon}ng ${fmtVND(expectedPayable.payableDueSoon)} · PO chưa HĐ ${fmtVND(expectedPayable.poValue)} · Chi dự kiến ${fmtVND(expectedPayable.plannedExpenseOpenValue)}`
                      : undefined
                  }
                  tooltip={`Công nợ phải trả quá hạn và đến hạn trong ${horizon} ngày tới + PO đã gửi/đang nhận CHƯA có hoá đơn + HĐ mua đang nháp + khoản chi dự kiến có hạn ≤ ${horizon} ngày tới. Bấm để xem theo NCC × mốc hạn.`}
                  onClick={() => setExpenseDetailOpen(true)}
                />
              </div>
              {missingPriceCount > 0 && (
                <NoticeBar
                  tone="amber"
                  text={`${missingPriceCount} đơn hàng chưa nhập đơn giá bán — số "Dự trù thu" chưa đủ.`}
                  link={canOpenOrders ? { href: "/bom", label: "Mở BOM" } : undefined}
                />
              )}
              {abnormalCount > 0 && (
                <NoticeBar
                  tone="rose"
                  text={`${abnormalCount} đơn có giá trị bất thường (SL × đơn giá quá lớn) — đã loại khỏi tổng. Kiểm tra lại đơn giá bán.`}
                  link={canOpenOrders ? { href: "/bom", label: "Mở BOM" } : undefined}
                />
              )}
            </section>

            {/* Số thực (đã ghi nhận) */}
            <section className="space-y-3">
              <SectionLabel>Số thực · đã ghi nhận ở Sổ quỹ</SectionLabel>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <KpiCard
                  icon={TrendingUp}
                  label="Tổng thu"
                  amount={cashflowFailed ? null : (cashflow?.summary.totalIn ?? 0)}
                  growth={cashflow?.growth?.inPct}
                  dot="emerald"
                />
                <KpiCard
                  icon={TrendingDown}
                  label="Tổng chi"
                  amount={cashflowFailed ? null : (cashflow?.summary.totalOut ?? 0)}
                  growth={cashflow?.growth?.outPct}
                  growthInverse
                  dot="rose"
                />
                <KpiCard
                  icon={ReceiptText}
                  label="Công nợ phải thu"
                  amount={summaryFailed ? null : totalReceivable}
                  dot="amber"
                />
                <KpiCard
                  icon={ReceiptText}
                  label="Công nợ phải trả"
                  amount={summaryFailed ? null : totalPayable}
                  dot="rose"
                />
                <KpiCard
                  icon={Landmark}
                  label="Số dư tài khoản"
                  amount={summaryFailed ? null : (summary?.totalBalance ?? 0)}
                  dot={null}
                />
              </div>
            </section>

            {/* Biểu đồ dòng tiền */}
            <section className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-zinc-800/70 dark:bg-zinc-900 md:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <Wallet className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                  </span>
                  <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">
                    Dòng tiền theo ngày
                  </p>
                </div>
                {cashflow?.growth && (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <GrowthPill label="Thu" pct={cashflow.growth.inPct} />
                    <GrowthPill label="Chi" pct={cashflow.growth.outPct} inverse />
                    <span className="hidden sm:inline">{cashflow.growth.vsLabel}</span>
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
            </section>
          </div>
        )}
      </div>

      <ExpectedExpenseSheet open={expenseDetailOpen} onOpenChange={setExpenseDetailOpen} horizon={horizon} />
      <ExpectedIncomeSheet open={incomeDetailOpen} onOpenChange={setIncomeDetailOpen} horizon={horizon} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">
      {children}
    </p>
  );
}

/**
 * Hero — số quan trọng nhất (chênh lệch thu–chi), kích thước nổi bật + sparkline
 * tích luỹ. Bề mặt lớn, bo 3xl, bóng nhẹ (phong cách Apple summary card).
 */
function HeroKpi({
  label,
  amount,
  series,
}: {
  label: string;
  amount: number | null;
  series?: CashflowPoint[];
}) {
  const isPositive = (amount ?? 0) >= 0;
  const sparkData = React.useMemo(() => {
    if (!series || series.length === 0) return [];
    let cumulative = 0;
    return series.map((p) => {
      cumulative += p.net;
      return { v: cumulative };
    });
  }, [series]);

  return (
    <div className="min-w-0 overflow-hidden rounded-3xl border border-zinc-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:border-zinc-800/70 dark:bg-zinc-900 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
          <p
            className={cn(
              "mt-2 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl",
              amount === null
                ? "text-zinc-400 dark:text-zinc-500"
                : amount === 0
                  ? "text-zinc-900 dark:text-zinc-100"
                  : isPositive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
            )}
          >
            {amount === null ? "—" : fmtVND(amount)}
          </p>
        </div>
        {sparkData.length > 1 && (
          <div className="h-16 w-full shrink-0 sm:w-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={isPositive ? "#059669" : "#e11d48"}
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

const DOT_CLASS = {
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
} as const;

function KpiCard({
  icon: Icon,
  label,
  amount,
  growth,
  growthInverse,
  dot,
}: {
  icon: React.ElementType;
  label: string;
  amount: number | null;
  growth?: number;
  growthInverse?: boolean;
  dot: keyof typeof DOT_CLASS | null;
}) {
  const isGood = growth !== undefined && (growthInverse ? growth <= 0 : growth >= 0);
  return (
    <div className="group min-w-0 rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:border-zinc-800/70 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <Icon className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" aria-hidden />
          </span>
          <div className="flex min-w-0 items-center gap-1.5 pt-0.5">
            <p className="text-xs font-medium leading-snug text-zinc-500 dark:text-zinc-400">{label}</p>
            {dot ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[dot])} aria-hidden /> : null}
          </div>
        </div>
        {growth !== undefined && (
          <span
            className={cn(
              "inline-flex whitespace-nowrap items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
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
      <p className="mt-2.5 truncate text-[22px] font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50" title={amount === null ? undefined : fmtVND(amount)}>
        {amount === null ? "—" : fmtVNDShort(amount)}
      </p>
      {amount === null ? (
        <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">Không tải được</p>
      ) : fmtVND(amount) !== fmtVNDShort(amount) ? (
        <p className="truncate text-xs tabular-nums text-zinc-400 dark:text-zinc-500">{fmtVND(amount)}</p>
      ) : null}
    </div>
  );
}

/**
 * Thẻ KPI "Kế hoạch" (Dự trù thu / Dự trù chi): có viền trái tông màu nhẹ,
 * tooltip công thức, dòng phụ chi tiết nguồn, click mở Sheet chi tiết.
 */
function PlanKpiCard({
  icon: Icon,
  tone,
  label,
  amount,
  sub,
  tooltip,
  onClick,
  action,
}: {
  icon: React.ElementType;
  tone: "emerald" | "rose";
  label: string;
  amount: number | null;
  sub?: string;
  action?: { label: string; onClick: () => void };
  tooltip: string;
  onClick?: () => void;
}) {
  const toneBar = tone === "emerald" ? "bg-emerald-400/70" : "bg-rose-400/70";
  const toneIcon =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
      : "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400";
  const body = (
    <div
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800/70 dark:bg-zinc-900",
        onClick && "transition-shadow hover:shadow-[0_2px_10px_rgba(0,0,0,0.07)]",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", toneBar)} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", toneIcon)}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <p className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300">{label}</p>
        </div>
        <SimpleTooltip content={tooltip}>
          <span
            tabIndex={0}
            role="img"
            aria-label="Giải thích công thức"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-bold text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
          >
            ?
          </span>
        </SimpleTooltip>
      </div>
      <p className="mt-3 truncate text-[28px] font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50" title={amount === null ? undefined : fmtVND(amount)}>
        {amount === null ? "—" : fmtVNDShort(amount)}
      </p>
      {amount === null ? (
        <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">Không tải được</p>
      ) : (
        <p className={cn("truncate text-xs tabular-nums text-zinc-400 dark:text-zinc-500", action && "pr-20")}>
          {sub ?? (fmtVND(amount) !== fmtVNDShort(amount) ? fmtVND(amount) : "")}
        </p>
      )}
    </div>
  );
  const main = onClick ? (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {body}
    </button>
  ) : (
    body
  );
  if (!action) return main;
  return (
    <div className="relative">
      {main}
      <button
        type="button"
        onClick={action.onClick}
        className="absolute bottom-3 right-3 rounded-lg border border-zinc-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-zinc-700 backdrop-blur transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {action.label}
      </button>
    </div>
  );
}

function NoticeBar({
  tone,
  text,
  link,
}: {
  tone: "amber" | "rose";
  text: string;
  link?: { href: string; label: string };
}) {
  const cls =
    tone === "amber"
      ? "border-amber-200/70 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
      : "border-rose-200/70 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300";
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs", cls)}>
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
      {link && (
        <Link href={link.href} className="ml-auto shrink-0 font-semibold underline hover:no-underline">
          {link.label}
        </Link>
      )}
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
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          : "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
      )}
    >
      {pct >= 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {label} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
