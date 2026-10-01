"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Factory,
  Landmark,
  PackageCheck,
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
import { fmtVND, fmtVNDShort, toDateInputValue } from "@/components/finance/_format";
import { useFinCashflow, useFinSummary, type CashflowPoint } from "@/hooks/useFinance";
import { useSession } from "@/hooks/useSession";
import { isRouteAllowed } from "@/lib/route-guard";
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
  const session = useSession();
  const roles = session.data?.roles;
  // V4.4.2 — chỉ dẫn link "mở danh sách nguồn" tới trang user THỰC SỰ vào
  // được (vd accountant không có quyền entity `productionBoard` nên không
  // vào được /production-board — card vẫn hiện số nhưng không phải link).
  const canOpenBoard = isRouteAllowed("/production-board", roles ?? []);
  const canOpenSales = isRouteAllowed("/sales", roles ?? []);

  const cashflow = cashflowQuery.data?.data;
  const summary = summaryQuery.data?.data;
  // TASK-20260922 — totalReceivable/totalPayable lấy trực tiếp từ dashboard
  // summary (đã bổ sung server-side) thay vì gọi lại API aging riêng.
  const totalReceivable = summary?.totalReceivable ?? 0;
  const totalPayable = summary?.totalPayable ?? 0;
  // V4.4.2 — hàng "Kế hoạch" (Đang sản xuất / Dự trù thu / Dự trù chi).
  const production = summary?.production;
  const expectedPayable = summary?.expectedPayable;
  const missingPriceCount = production?.missingPriceCount ?? 0;
  // V4.5 QA-D P1-01 — dòng giá bất thường (qty × đơn giá vượt ngưỡng hợp lý)
  // bị loại khỏi tổng "Đang sản xuất"/"Dự trù thu" ở server — cảnh báo riêng
  // thay vì im lặng bỏ qua (tránh người xem tưởng số liệu đã đủ).
  const abnormalCount = production?.abnormalCount ?? 0;

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
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Tổng quan Tài chính
          </h1>
        </div>

        {/* Date range picker — segmented control dùng chung (V4.4 A12), nút
            active nền đen/zinc-900 khớp mẫu chuẩn toàn hệ (khác 3 kiểu tô màu
            trước đây, xem plans/v4.4-ui/UI_INVENTORY.md §A12). */}
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
            <DateField
              value={customFrom}
              onChange={setCustomFrom}
              aria-label="Từ ngày"
              className="w-32"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span>Đến</span>
            <DateField
              value={customTo}
              onChange={setCustomTo}
              aria-label="Đến ngày"
              className="w-32"
            />
          </label>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-xl" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Hero KPI — số quan trọng nhất nổi bật (§3.1) */}
            <HeroKpi
              label="Chênh lệch thu–chi kỳ này"
              amount={cashflowFailed ? null : (cashflow?.summary.netCashflow ?? 0)}
              series={cashflow?.series}
            />

            {/* V4.4.2 — hàng "Kế hoạch" (Đang sản xuất / Dự trù thu / Dự trù
                chi), TÁCH BẠCH khỏi hàng số thực bên dưới (nguồn Bảng sản
                xuất + PO mở, không phải sổ quỹ đã ghi nhận). */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Kế hoạch (dự trù — chưa phát sinh dòng tiền thực)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <PlanKpiCard
                  icon={Factory}
                  label="Đang sản xuất"
                  amount={summaryFailed ? null : (production?.inProduction.value ?? 0)}
                  sub={
                    production
                      ? `${production.inProduction.itemCount} mã hàng`
                      : undefined
                  }
                  tooltip="Σ(SL kế hoạch × đơn giá) các mã hàng đang chạy trên Bảng sản xuất (Sắp gia công / Đang gia công / Đang kiểm QC)."
                  href={canOpenBoard ? "/production-board" : undefined}
                />
                <PlanKpiCard
                  icon={PackageCheck}
                  label="Dự trù thu"
                  amount={summaryFailed ? null : (production?.expectedReceivable.value ?? 0)}
                  sub={
                    production
                      ? `${production.expectedReceivable.itemCount} mã hàng hoàn thành, chưa giao`
                      : undefined
                  }
                  tooltip="Σ(SL đã đạt × đơn giá) các mã hàng đã Hoàn thành nhưng chưa giao khách — hàng đã làm xong, tiền chưa về."
                  href={canOpenBoard ? "/production-board" : undefined}
                />
                <PlanKpiCard
                  icon={Wallet}
                  label="Dự trù chi"
                  amount={summaryFailed ? null : (expectedPayable?.value ?? 0)}
                  sub={
                    expectedPayable
                      ? `${expectedPayable.poCount} PO mở · ${expectedPayable.draftInvoiceCount} HĐ nháp`
                      : undefined
                  }
                  tooltip="Giá trị PO đã gửi/đang nhận CHƯA có hoá đơn mua + tổng hoá đơn mua đang NHÁP (chưa xác nhận) — KHÔNG gồm hoá đơn đã xác nhận (đã nằm trong Công nợ phải trả)."
                  href={canOpenSales ? "/sales?tab=po" : undefined}
                />
              </div>
              {missingPriceCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {missingPriceCount} mã hàng chưa có đơn giá — số liệu "Đang sản xuất"/"Dự trù thu" chưa đủ.
                  </span>
                  {canOpenBoard && (
                    <Link
                      href="/production-board?missingPrice=1"
                      className="ml-auto shrink-0 font-semibold underline hover:no-underline"
                    >
                      Xem danh sách
                    </Link>
                  )}
                </div>
              )}
              {abnormalCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {abnormalCount} dòng có giá bất thường (SL × đơn giá quá lớn) — đã loại khỏi
                    tổng "Đang sản xuất"/"Dự trù thu" để không làm sai số liệu. Kiểm tra lại đơn
                    giá trên Bảng sản xuất.
                  </span>
                  {canOpenBoard && (
                    <Link
                      href="/production-board"
                      className="ml-auto shrink-0 font-semibold underline hover:no-underline"
                    >
                      Xem danh sách
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* 5 KPI phụ — grid responsive để nhãn dài ("Công nợ phải thu/trả")
                không bị cắt trên mobile (§1.1 P0). */}
            <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Số thực (đã ghi nhận)
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
            </div>

            {/* Chart */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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

/**
 * Hero KPI — số quan trọng nhất trang (chênh lệch thu–chi), to nổi bật hơn
 * hẳn 5 thẻ phụ (§2.1: text-3xl vs text-xl) + sparkline mini tái dùng cùng
 * dữ liệu `cashflow.series` (§3.1) — không trục/tooltip, chỉ đường xu hướng.
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
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
          </div>
          <p
            className={cn(
              "mt-1.5 text-3xl font-bold tabular-nums",
              amount === null
                ? "text-zinc-400 dark:text-zinc-500"
                : amount === 0
                  ? "text-zinc-900 dark:text-zinc-100"
                  : isPositive
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400",
            )}
          >
            {amount === null ? "—" : fmtVND(amount)}
          </p>
        </div>
        {sparkData.length > 1 && (
          <div className="h-14 w-full shrink-0 sm:w-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={isPositive ? "#059669" : "#e11d48"}
                  strokeWidth={2}
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
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        {/* Nhãn KHÔNG truncate — trước đây cắt "Công nợ phải ..." trên mobile khiến
            2 thẻ công nợ khác chiều hiện giống hệt nhau (§1.1 P0). Cho wrap 2 dòng. */}
        <div className="flex min-w-0 items-start gap-1.5">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
          <p className="text-xs font-medium leading-snug text-zinc-500 dark:text-zinc-400">{label}</p>
          {accentDot ? <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", accentDot)} aria-hidden /> : null}
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

/**
 * V4.4.2 — Thẻ KPI hàng "Kế hoạch" (Đang sản xuất / Dự trù thu / Dự trù chi).
 * Khác `KpiCard` (hàng "Số thực"): có tooltip giải thích công thức tiếng
 * Việt (`SimpleTooltip`) + dòng phụ `sub` (số mã hàng/PO) + click mở trang
 * nguồn khi user có quyền vào (`href`); không có `growth` (số kế hoạch,
 * không so kỳ trước).
 */
function PlanKpiCard({
  icon: Icon,
  label,
  amount,
  sub,
  tooltip,
  href,
}: {
  icon: React.ElementType;
  label: string;
  amount: number | null;
  sub?: string;
  tooltip: string;
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900",
        href && "transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
          <p className="text-xs font-medium leading-snug text-zinc-500 dark:text-zinc-400">{label}</p>
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
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50" title={amount === null ? undefined : fmtVND(amount)}>
        {amount === null ? "—" : fmtVNDShort(amount)}
      </p>
      {amount === null ? (
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">Không tải được</p>
      ) : (
        <p className="truncate text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {sub ?? (fmtVND(amount) !== fmtVNDShort(amount) ? fmtVND(amount) : "")}
        </p>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
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
