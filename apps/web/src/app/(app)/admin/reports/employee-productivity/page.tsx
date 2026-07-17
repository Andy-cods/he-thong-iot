"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  Download,
  Loader2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  useEmployeeReport,
  type EmployeeReport,
  type ProductivityMetric,
} from "@/hooks/useReports";
import { useUsersList } from "@/hooks/useAdmin";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { downloadFromUrl } from "@/lib/download";

/**
 * V3.7.61 — Page báo cáo năng suất nhân viên cho admin.
 * Spec: docs/employee-productivity-spec.md
 */

export const dynamic = "force-dynamic";

function currentVnYearMonth(): { year: number; month: number } {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600_000);
  return { year: vn.getUTCFullYear(), month: vn.getUTCMonth() + 1 };
}

function formatNumOrDash(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return formatNumber(n);
}

function formatVND(n: number | null | undefined): string {
  if (n == null || n === 0) return "0 ₫";
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

export default function EmployeeProductivityPage() {
  const initial = currentVnYearMonth();
  const [year, setYear] = React.useState(initial.year);
  const [month, setMonth] = React.useState(initial.month);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [compareIds, setCompareIds] = React.useState<string[]>([]);

  const usersQuery = useUsersList({ pageSize: 200, isActive: true });
  const users = usersQuery.data?.data ?? [];

  // Auto-select user đầu tiên
  React.useEffect(() => {
    if (!selectedUserId && users.length > 0) {
      setSelectedUserId(users[0]!.id);
    }
  }, [selectedUserId, users]);

  const reportQuery = useEmployeeReport(selectedUserId, { year, month });
  const data = reportQuery.data?.data;

  // V3.11.1 — fetch→blob→download (ổn định, đọc được lỗi) thay window.open.
  const handleExport = () => {
    if (!selectedUserId) return;
    void (async () => {
      try {
        await downloadFromUrl(
          `/api/reports/employee/${selectedUserId}/export?year=${year}&month=${month}`,
          `bao-cao-nang-suat-${year}-${String(month).padStart(2, "0")}.xlsx`,
        );
      } catch (e) {
        toast.error(`Không xuất được báo cáo: ${(e as Error).message}`);
      }
    })();
  };

  return (
    <AdminPageShell
      breadcrumb={[
        { label: "Trang chủ", href: "/" },
        { label: "Quản trị", href: "/admin" },
        { label: "Báo cáo năng suất" },
      ]}
      title="Báo cáo năng suất nhân viên"
      description="Theo dõi hoạt động, sản lượng và mức độ đạt KPI của từng nhân viên theo tháng."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            disabled={!selectedUserId}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export Excel
          </Button>
          <Link
            href="/admin/reports/department"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-700 dark:hover:text-indigo-400"
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Xem theo bộ phận
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Filter bar */}
        <section className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <FilterField label="Nhân viên">
            <FilterSelect
              value={selectedUserId ?? ""}
              onChange={(e) => setSelectedUserId(e.target.value || null)}
              className="min-w-[280px]"
            >
              <option value="">— Chọn nhân viên —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} · {u.username}
                </option>
              ))}
            </FilterSelect>
          </FilterField>
          <FilterField label="Tháng">
            <FilterSelect
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-28"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </FilterSelect>
          </FilterField>
          <FilterField label="Năm">
            <FilterSelect
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24"
            >
              {[initial.year, initial.year - 1, initial.year - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </FilterSelect>
          </FilterField>
          <div className="flex-1" />
          <CompareToggle
            users={users}
            selectedUserId={selectedUserId}
            compareIds={compareIds}
            setCompareIds={setCompareIds}
          />
        </section>

        <div>
          {!selectedUserId ? (
            <EmptyMessage text="Vui lòng chọn 1 nhân viên để xem báo cáo." />
          ) : reportQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-12 text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải báo cáo…
            </div>
          ) : reportQuery.isError ? (
            <EmptyMessage
              text={`Lỗi: ${(reportQuery.error as Error)?.message ?? "Không tải được"}`}
              isError
            />
          ) : data ? (
            <ReportView data={data} />
          ) : null}

          {compareIds.length > 0 ? (
            <CompareSection
              userIds={compareIds.filter((id) => id !== selectedUserId)}
              year={year}
              month={month}
              primaryReport={data}
            />
          ) : null}
        </div>
      </div>
    </AdminPageShell>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold uppercase tracking-normal text-zinc-500 dark:text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function FilterSelect({
  className,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(
        "h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm tracking-normal text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/40",
        className,
      )}
    />
  );
}

/* ─────────────────────────────────────────────────────────── */
/* ReportView                                                  */
/* ─────────────────────────────────────────────────────────── */

function ReportView({ data }: { data: EmployeeReport }) {
  return (
    <div className="space-y-4">
      <HeroCard data={data} />

      {/* KPI grid */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {data.metrics.map((m) => (
          <MetricCard key={m.id} metric={m} />
        ))}
      </section>

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
  const roles = data.user.roles
    .map((r) => roleLabels[r] ?? r)
    .join(" · ");
  return (
    <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-indigo-50 to-violet-50/30 p-5 shadow-sm dark:border-zinc-800 dark:from-indigo-950/40 dark:to-violet-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold uppercase text-white">
              {data.user.fullName?.charAt(0) ?? "?"}
            </span>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {data.user.fullName}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {data.user.username} · {roles}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[13px] text-zinc-600 dark:text-zinc-400">
            <strong className="text-zinc-900 dark:text-zinc-50">{data.period.label}</strong> ·{" "}
            <strong className="text-emerald-700 dark:text-emerald-400">
              {data.period.activeDays}
            </strong>{" "}
            ngày hoạt động ·{" "}
            <strong className="text-indigo-700 dark:text-indigo-400">
              {formatNumber(data.summary.totalActions)}
            </strong>{" "}
            actions
          </p>
          {data.summary.lastSeen ? (
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Lần online cuối:{" "}
              {new Date(data.summary.lastSeen).toLocaleString("vi-VN")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-1 text-right">
          {data.summary.productionQty != null && data.summary.productionQty > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Sản lượng đạt
              </div>
              <div className="text-2xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                {formatNumber(data.summary.productionQty)}
              </div>
            </div>
          ) : null}
          {data.summary.poValue != null && data.summary.poValue > 0 ? (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Giá trị PO
              </div>
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
          ? "border-emerald-300 ring-1 ring-emerald-100 dark:border-emerald-800 dark:ring-emerald-900/40"
          : t && !t.achieved
            ? "border-rose-200 dark:border-rose-800"
            : "border-zinc-200 dark:border-zinc-700",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {metric.label}
        </div>
        {t ? (
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              t.achieved
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
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
          <span
            className={cn(
              "font-semibold",
              t.achieved ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400",
            )}
          >
            {t.achievementPct}%
          </span>
        </div>
      ) : null}
    </div>
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
      <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-500 dark:text-zinc-400">
        <span>0 → {max} actions/ngày</span>
        <span>·</span>
        <span>
          {data.filter((d) => d.actions > 0).length} ngày có hoạt động
        </span>
      </div>
    </section>
  );
}

function RecentActions({
  actions,
}: {
  actions: EmployeeReport["recentActions"];
}) {
  if (actions.length === 0) {
    return (
      <section className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          <Activity className="h-4 w-4 text-indigo-500" />
          Hoạt động gần nhất
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
              <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                {a.timestamp}
              </span>
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:ring-indigo-800">
                {a.action}
              </span>
              <span className="text-zinc-700 dark:text-zinc-300">
                {a.objectType}
                {a.objectCode ? ` · ${a.objectCode}` : ""}
              </span>
            </div>
            {a.notes ? (
              <p className="mt-0.5 pl-[60px] text-[11px] italic text-zinc-500 dark:text-zinc-400">
                "{a.notes}"
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Compare mode                                                */
/* ─────────────────────────────────────────────────────────── */

function CompareToggle({
  users,
  selectedUserId,
  compareIds,
  setCompareIds,
}: {
  users: Array<{ id: string; username: string; fullName: string }>;
  selectedUserId: string | null;
  compareIds: string[];
  setCompareIds: (ids: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold uppercase tracking-normal text-zinc-500 dark:text-zinc-400">
        So sánh thêm (max 2)
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-9 min-w-[180px] items-center justify-between gap-1 rounded-md border border-zinc-200 bg-white px-3 text-[13px] hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
        >
          <Users className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
          <span>{compareIds.length === 0 ? "+ Thêm so sánh" : `${compareIds.length} đã chọn`}</span>
        </button>
        {open ? (
          <div className="absolute right-0 top-10 z-10 max-h-[300px] w-[280px] overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {users
              .filter((u) => u.id !== selectedUserId)
              .map((u) => {
                const checked = compareIds.includes(u.id);
                const disabled = !checked && compareIds.length >= 2;
                return (
                  <label
                    key={u.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px]",
                      disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCompareIds([...compareIds, u.id]);
                        } else {
                          setCompareIds(compareIds.filter((id) => id !== u.id));
                        }
                      }}
                    />
                    <span>{u.fullName}</span>
                    <span className="text-zinc-400 dark:text-zinc-500">· {u.username}</span>
                  </label>
                );
              })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CompareSection({
  userIds,
  year,
  month,
  primaryReport,
}: {
  userIds: string[];
  year: number;
  month: number;
  primaryReport: EmployeeReport | undefined;
}) {
  if (userIds.length === 0 || !primaryReport) return null;
  return (
    <section className="mt-6 rounded-md border-2 border-dashed border-indigo-200 bg-indigo-50/30 p-4 dark:border-indigo-800 dark:bg-indigo-950/20">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-indigo-800 dark:text-indigo-400">
        So sánh với người khác
      </h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {userIds.map((id) => (
          <CompareCard
            key={id}
            userId={id}
            year={year}
            month={month}
            primary={primaryReport}
          />
        ))}
      </div>
    </section>
  );
}

function CompareCard({
  userId,
  year,
  month,
  primary,
}: {
  userId: string;
  year: number;
  month: number;
  primary: EmployeeReport;
}) {
  const q = useEmployeeReport(userId, { year, month });
  if (q.isLoading) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white p-4 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Đang tải…
      </div>
    );
  }
  const d = q.data?.data;
  if (!d) return null;
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-zinc-100 text-xs font-bold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {d.user.fullName?.charAt(0) ?? "?"}
        </span>
        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{d.user.fullName}</div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{d.user.username}</div>
        </div>
        <div className="ml-auto text-[10px] text-zinc-500 dark:text-zinc-400">
          {d.period.activeDays} ngày · {d.summary.totalActions} actions
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {d.metrics.slice(0, 4).map((m) => {
          const peer = primary.metrics.find((p) => p.id === m.id);
          const peerValue = peer?.value ?? peer?.count ?? 0;
          const myValue = m.value ?? m.count;
          const better = myValue > peerValue;
          return (
            <div key={m.id} className="rounded bg-zinc-50 px-2 py-1.5 dark:bg-zinc-800/60">
              <div className="text-[9px] uppercase text-zinc-500 dark:text-zinc-400">{m.label}</div>
              <div
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  better ? "text-emerald-700 dark:text-emerald-400" : myValue < peerValue ? "text-rose-700 dark:text-rose-400" : "text-zinc-700 dark:text-zinc-300",
                )}
              >
                {formatNumOrDash(myValue)}
                {peer && peerValue > 0 ? (
                  <span className="ml-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                    (vs {formatNumOrDash(peerValue)})
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyMessage({ text, isError = false }: { text: string; isError?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border border-dashed px-6 py-12 text-center text-sm",
        isError
          ? "border-rose-300 bg-rose-50/30 text-rose-700 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-400"
          : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
      )}
    >
      {text}
    </div>
  );
}
