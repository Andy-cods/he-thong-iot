"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { useMyProductivityReport, type EmployeeReport, type ProductivityMetric } from "@/hooks/useReports";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

/**
 * V3.7.62 — Self-view báo cáo năng suất.
 * Mọi role đã login đều xem được report của chính họ.
 * Không có drop-down chọn user khác (privacy).
 */

export const dynamic = "force-dynamic";

type PeriodMode = "month" | "quarter" | "year";

function currentVnYearMonth() {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600_000);
  return {
    year: vn.getUTCFullYear(),
    month: vn.getUTCMonth() + 1,
    quarter: Math.floor(vn.getUTCMonth() / 3) + 1,
  };
}

function formatVND(n: number | null | undefined): string {
  if (n == null || n === 0) return "0 ₫";
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

export default function MyProductivityPage() {
  const initial = currentVnYearMonth();
  const [mode, setMode] = React.useState<PeriodMode>("month");
  const [year, setYear] = React.useState(initial.year);
  const [month, setMonth] = React.useState(initial.month);
  const [quarter, setQuarter] = React.useState(initial.quarter);

  const period =
    mode === "month"
      ? { year, month }
      : mode === "quarter"
        ? { year, quarter }
        : { year };

  const reportQuery = useMyProductivityReport(period);
  const data = reportQuery.data?.data;

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-50">Tổng quan</Link>
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">Năng suất của tôi</span>
        </nav>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Báo cáo năng suất của tôi
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Xem hoạt động + KPIs cá nhân theo tháng / quý / năm.
        </p>
      </header>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Khoảng</Label>
          <div className="flex gap-1">
            {(["month", "quarter", "year"] as PeriodMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "h-9 rounded-md px-3 text-xs font-medium transition-colors",
                  mode === m
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-zinc-800/60",
                )}
              >
                {m === "month" ? "Tháng" : m === "quarter" ? "Quý" : "Năm"}
              </button>
            ))}
          </div>
        </div>
        {mode === "month" ? (
          <div className="space-y-1">
            <Label className="text-[10px] uppercase">Tháng</Label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="h-9 w-24 rounded-md border border-zinc-200 bg-white px-3 text-[13px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>
        ) : null}
        {mode === "quarter" ? (
          <div className="space-y-1">
            <Label className="text-[10px] uppercase">Quý</Label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              className="h-9 w-24 rounded-md border border-zinc-200 bg-white px-3 text-[13px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>Quý {q}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Năm</Label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-9 w-24 rounded-md border border-zinc-200 bg-white px-3 text-[13px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {[initial.year, initial.year - 1, initial.year - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1100px] p-6">
        {reportQuery.isLoading ? (
          <div className="flex items-center gap-2 py-12 text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải báo cáo…
          </div>
        ) : reportQuery.isError ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-6 py-12 text-center text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400">
            Lỗi: {(reportQuery.error as Error)?.message ?? "Không tải được"}
          </div>
        ) : data ? (
          <ReportView data={data} />
        ) : null}
      </div>
    </div>
  );
}

function ReportView({ data }: { data: EmployeeReport }) {
  return (
    <div className="space-y-4">
      <HeroCard data={data} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {data.metrics.map((m) => (
          <MetricCard key={m.id} metric={m} />
        ))}
      </section>

      <Trend6mChart data={data.trend6m} currentLabel={data.period.label} />

      <DailyChart data={data.chartDaily} label={data.period.label} />

      <RecentActions actions={data.recentActions} />
    </div>
  );
}

function HeroCard({ data }: { data: EmployeeReport }) {
  const roleLabels: Record<string, string> = {
    admin: "Quản trị",
    planner: "Thiết kế",
    operator: "Gia công",
    warehouse: "Kho",
    purchaser: "Thu mua",
  };
  const roles = data.user.roles.map((r) => roleLabels[r] ?? r).join(" · ");
  return (
    <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-emerald-50 to-teal-50/30 p-5 shadow-sm dark:border-zinc-800 dark:from-emerald-950/40 dark:to-teal-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold uppercase text-white">
              {data.user.fullName?.charAt(0) ?? "?"}
            </span>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{data.user.fullName}</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{data.user.username} · {roles}</p>
            </div>
          </div>
          <p className="mt-3 text-[13px] text-zinc-600 dark:text-zinc-400">
            <strong className="text-zinc-900 dark:text-zinc-50">{data.period.label}</strong> ·{" "}
            <strong className="text-emerald-700 dark:text-emerald-400">{data.period.activeDays}</strong> ngày hoạt động ·{" "}
            <strong className="text-indigo-700 dark:text-indigo-400">{formatNumber(data.summary.totalActions)}</strong> actions
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          {data.summary.productionQty != null && data.summary.productionQty > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Sản lượng đạt</div>
              <div className="text-2xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                {formatNumber(data.summary.productionQty)}
              </div>
            </div>
          ) : null}
          {data.summary.poValue != null && data.summary.poValue > 0 ? (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Giá trị PO</div>
              <div className="text-base font-semibold text-blue-700 tabular-nums dark:text-blue-400">
                {formatVND(data.summary.poValue)}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: ProductivityMetric }) {
  const showValue = metric.value != null && metric.value > 0;
  const t = metric.target;
  return (
    <div
      className={cn(
        "rounded-md border bg-white px-3 py-3 shadow-sm transition-colors dark:bg-zinc-900",
        t?.achieved
          ? "border-emerald-300 ring-1 ring-emerald-100 dark:border-emerald-700 dark:ring-emerald-900/40"
          : t && !t.achieved
            ? "border-rose-200 dark:border-rose-800"
            : "border-zinc-200 dark:border-zinc-800",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{metric.label}</div>
        {t ? (
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              t.achieved ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
            )}
            title={`Target ${t.comparison === "gte" ? "≥" : "≤"} ${t.value}`}
          >
            {t.achieved ? "✓ đạt" : "✗ chưa"}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-zinc-900 tabular-nums dark:text-zinc-50">
          {showValue ? formatNumber(metric.value!) : metric.count}
        </span>
        {showValue && metric.unit ? (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{metric.unit}</span>
        ) : null}
      </div>
      {showValue && metric.count > 0 ? (
        <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          {metric.count} {metric.count === 1 ? "lần" : "lượt"}
        </div>
      ) : null}
      {t ? (
        <div className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
          Target {t.comparison === "gte" ? "≥" : "≤"}{" "}
          <strong className="text-zinc-700 dark:text-zinc-300">{formatNumber(t.value)}</strong>
          {" · "}
          <span className={cn("font-semibold", t.achieved ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
            {t.achievementPct}%
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Trend6mChart({
  data,
  currentLabel,
}: {
  data: EmployeeReport["trend6m"];
  currentLabel: string;
}) {
  if (!data || data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.actions));
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        <TrendingUp className="h-4 w-4 text-emerald-600" />
        Xu hướng 6 tháng gần nhất (trước {currentLabel})
      </div>
      <div className="flex items-end gap-2">
        {data.map((d) => {
          const heightPct = (d.actions / max) * 100;
          return (
            <div key={d.month} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="font-mono text-[10px] text-zinc-700 dark:text-zinc-300">{d.actions}</span>
              <div
                className={cn(
                  "w-full rounded-t-md transition-colors",
                  d.actions > 0 ? "bg-gradient-to-t from-emerald-500 to-emerald-400" : "bg-zinc-100 dark:bg-zinc-800",
                )}
                style={{ height: `${Math.max(8, heightPct)}px` }}
              />
              <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{d.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DailyChart({
  data,
  label,
}: {
  data: Array<{ date: string; actions: number }>;
  label: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.actions));
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        <BarChart3 className="h-4 w-4 text-indigo-500" />
        Hoạt động theo ngày — {label}
      </div>
      <div className="flex items-end gap-0.5 overflow-x-auto pb-2">
        {data.map((d) => {
          const heightPct = (d.actions / max) * 100;
          return (
            <div
              key={d.date}
              className="flex min-w-[18px] flex-1 flex-col items-center justify-end"
              title={`${d.date}: ${d.actions} actions`}
            >
              <div
                className={cn(
                  "w-full rounded-t-sm transition-colors",
                  d.actions > 0 ? "bg-indigo-500" : "bg-zinc-100 dark:bg-zinc-800",
                )}
                style={{ height: `${Math.max(2, heightPct)}px`, minHeight: "2px" }}
              />
              <span className="mt-0.5 font-mono text-[8px] text-zinc-400 dark:text-zinc-500">
                {d.date.slice(8)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecentActions({ actions }: { actions: EmployeeReport["recentActions"] }) {
  if (actions.length === 0) {
    return (
      <section className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          <Activity className="h-4 w-4 text-indigo-500" /> Hoạt động gần nhất
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Chưa có audit log trong khoảng thời gian này.</p>
      </section>
    );
  }
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        <Activity className="h-4 w-4 text-indigo-500" />
        Hoạt động gần nhất ({actions.length})
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {actions.map((a, i) => (
          <li key={i} className="py-2 text-[12px]">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{a.timestamp}</span>
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:ring-indigo-800">
                {a.action}
              </span>
              <span className="text-zinc-700 dark:text-zinc-300">
                {a.objectType}{a.objectCode ? ` · ${a.objectCode}` : ""}
              </span>
            </div>
            {a.notes ? (
              <p className="mt-0.5 pl-[60px] text-[11px] italic text-zinc-500 dark:text-zinc-400">"{a.notes}"</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
