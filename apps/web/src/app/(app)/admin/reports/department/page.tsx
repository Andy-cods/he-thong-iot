"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Loader2, Users } from "lucide-react";
import { useDepartmentReport } from "@/hooks/useReports";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

const ROLE_OPTIONS = [
  { value: "operator", label: "Bộ phận Gia công" },
  { value: "warehouse", label: "Bộ phận Kho" },
  { value: "purchaser", label: "Bộ phận Thu mua" },
  { value: "planner", label: "Bộ phận Thiết kế" },
] as const;

const SORT_OPTIONS_BY_ROLE: Record<
  string,
  Array<{ value: string; label: string }>
> = {
  operator: [
    { value: "production_qty_good", label: "Sản lượng đạt" },
    { value: "wo_completed", label: "WO hoàn thành" },
    { value: "wo_created", label: "WO tạo" },
    { value: "progress_reports", label: "Báo cáo tiến độ" },
  ],
  warehouse: [
    { value: "receivings", label: "Nhận hàng" },
    { value: "inv_plus", label: "Bổ sung tồn" },
    { value: "issues_picked", label: "Xuất kho" },
    { value: "qc_checks", label: "QC kiểm" },
  ],
  purchaser: [
    { value: "po_created", label: "PO tạo" },
    { value: "po_value", label: "Giá trị PO" },
    { value: "pr_approved", label: "PR duyệt" },
  ],
  planner: [
    { value: "bom_created", label: "BOM tạo" },
    { value: "bom_revisions_released", label: "Revision release" },
    { value: "wo_created", label: "WO tạo" },
  ],
};

function currentVnYearMonth() {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600_000);
  return { year: vn.getUTCFullYear(), month: vn.getUTCMonth() + 1 };
}

export default function DepartmentReportPage() {
  const router = useRouter();
  const initial = currentVnYearMonth();
  const [role, setRole] = React.useState<string>("operator");
  const [year, setYear] = React.useState(initial.year);
  const [month, setMonth] = React.useState(initial.month);
  const [sortBy, setSortBy] = React.useState<string>("production_qty_good");

  const sortOptions = SORT_OPTIONS_BY_ROLE[role] ?? [];

  React.useEffect(() => {
    if (
      sortOptions.length > 0 &&
      !sortOptions.find((o) => o.value === sortBy)
    ) {
      setSortBy(sortOptions[0]!.value);
    }
  }, [role, sortOptions, sortBy]);

  const q = useDepartmentReport(role, { year, month }, { sortBy });
  const data = q.data?.data;

  return (
    <AdminPageShell
      breadcrumb={[
        { label: "Trang chủ", href: "/" },
        { label: "Quản trị", href: "/admin" },
        { label: "Báo cáo", href: "/admin/reports/employee-productivity" },
        { label: "Bộ phận" },
      ]}
      title="Báo cáo bộ phận · Leaderboard"
      description="So sánh năng suất giữa các thành viên trong cùng một bộ phận."
      actions={
        <Link
          href="/admin/reports/employee-productivity"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700"
        >
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          Xem theo nhân viên
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Filter card */}
        <section className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <Field label="Bộ phận">
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="min-w-[200px]"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tháng">
            <Select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-28"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Năm">
            <Select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24"
            >
              {[initial.year, initial.year - 1, initial.year - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sắp xếp theo">
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="min-w-[180px]"
            >
              {sortOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </section>

        {q.isLoading ? (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-12 text-zinc-500 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải leaderboard…
          </div>
        ) : q.isError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-700 shadow-sm">
            Lỗi: {(q.error as Error)?.message ?? "Không tải được"}
          </div>
        ) : data ? (
          <Leaderboard
            data={data}
            sortBy={sortBy}
            onClickUser={(id) =>
              router.push(`/admin/reports/employee-productivity?user=${id}`)
            }
          />
        ) : null}
      </div>
    </AdminPageShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold uppercase tracking-normal text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({
  className,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(
        "h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm tracking-normal text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
        className,
      )}
    />
  );
}

function Leaderboard({
  data,
  sortBy,
  onClickUser,
}: {
  data: NonNullable<
    ReturnType<typeof useDepartmentReport>["data"]
  >["data"];
  sortBy: string;
  onClickUser: (id: string) => void;
}) {
  if (data.leaderboard.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
        Bộ phận này chưa có nhân viên active.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-zinc-900">
              {data.department.label}
            </h2>
            <p className="text-xs text-zinc-500">
              {data.department.memberCount} nhân viên · {data.period.label}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-normal text-zinc-500">
              Sắp xếp theo
            </div>
            <div className="text-sm font-medium text-indigo-700">
              {SORT_OPTIONS_BY_ROLE[data.department.role]?.find(
                (o) => o.value === sortBy,
              )?.label ?? sortBy}
            </div>
          </div>
        </div>
      </div>

      <ol className="space-y-2">
        {data.leaderboard.map((row) => (
          <li
            key={row.user.id}
            onClick={() => onClickUser(row.user.id)}
            className="group cursor-pointer rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <RankBadge rank={row.rank} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold tracking-tight text-zinc-900">
                  {row.user.fullName}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {row.user.username}
                </div>
              </div>
              <div className="hidden flex-wrap items-center justify-end gap-3 md:flex">
                {Object.entries(row.keyMetrics)
                  .slice(0, 4)
                  .map(([k, v]) => (
                    <div key={k} className="text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-normal text-zinc-500">
                        {SORT_OPTIONS_BY_ROLE[data.department.role]?.find(
                          (o) => o.value === k,
                        )?.label ?? k}
                      </div>
                      <div
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          k === sortBy ? "text-indigo-700" : "text-zinc-700",
                        )}
                      >
                        {formatNumber(v)}
                      </div>
                    </div>
                  ))}
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-300 transition-colors group-hover:text-indigo-500" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const styles =
    rank === 1
      ? "bg-yellow-100 text-yellow-800 ring-2 ring-yellow-400"
      : rank === 2
        ? "bg-zinc-100 text-zinc-700 ring-2 ring-zinc-300"
        : rank === 3
          ? "bg-orange-100 text-orange-800 ring-2 ring-orange-300"
          : "bg-zinc-50 text-zinc-500";
  const emoji =
    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "#";
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        styles,
      )}
    >
      {rank <= 3 ? <span>{emoji}</span> : <span>#{rank}</span>}
    </div>
  );
}
