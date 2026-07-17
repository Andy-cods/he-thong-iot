"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  useCreateReportTarget,
  useDeleteReportTarget,
  useReportTargets,
  useUpdateReportTarget,
  type ReportTargetRow,
} from "@/hooks/useReports";
import { cn } from "@/lib/utils";

/**
 * V3.7.62 — Admin CRUD KPI Targets.
 * Set baseline cho mỗi (role, metric, period_type) → hiển thị "đạt/chưa"
 * trên MetricCard của employee/self report.
 */

export const dynamic = "force-dynamic";

const ROLE_OPTIONS = [
  { value: "operator", label: "Bộ phận Gia công" },
  { value: "warehouse", label: "Bộ phận Kho" },
  { value: "purchaser", label: "Bộ phận Thu mua" },
  { value: "planner", label: "Bộ phận Thiết kế" },
  { value: "admin", label: "Quản trị" },
];

const METRIC_OPTIONS: Record<string, Array<{ id: string; label: string }>> = {
  operator: [
    { id: "wo_created", label: "Lệnh SX tạo" },
    { id: "wo_completed", label: "WO hoàn thành" },
    { id: "production_qty_good", label: "Sản lượng đạt" },
    { id: "production_qty_scrap", label: "Phế phẩm" },
    { id: "progress_reports", label: "Báo cáo tiến độ" },
  ],
  warehouse: [
    { id: "inv_plus", label: "Bổ sung tồn (+)" },
    { id: "inv_minus", label: "Giảm tồn (−)" },
    { id: "receivings", label: "Nhận hàng (PO)" },
    { id: "qc_checks", label: "QC kiểm" },
    { id: "putaways", label: "Putaway lots" },
    { id: "issues_picked", label: "Xuất kho" },
  ],
  purchaser: [
    { id: "pr_approved", label: "PR duyệt" },
    { id: "po_created", label: "PO tạo" },
    { id: "po_value", label: "Tổng giá trị PO" },
  ],
  planner: [
    { id: "bom_created", label: "BOM tạo" },
    { id: "bom_revisions_released", label: "Revision release" },
    { id: "wo_created", label: "WO tạo" },
  ],
  admin: [
    { id: "audit_total", label: "Tổng action audit" },
    { id: "logins", label: "Lượt đăng nhập" },
  ],
};

export default function ReportTargetsPage() {
  const [filterRole, setFilterRole] = React.useState<string>("operator");
  const [showCreate, setShowCreate] = React.useState(false);

  const targetsQuery = useReportTargets({
    roleCode: filterRole,
    isActive: true,
  });
  const targets = targetsQuery.data?.data ?? [];

  return (
    <AdminPageShell
      breadcrumb={[
        { label: "Trang chủ", href: "/" },
        { label: "Quản trị", href: "/admin" },
        { label: "Báo cáo", href: "/admin/reports/employee-productivity" },
        { label: "KPI Targets" },
      ]}
      title="KPI Baselines / Mục tiêu năng suất"
      description={
        <span className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
          Set baseline cho mỗi (bộ phận × metric × period). Khi báo cáo có
          target → hiển thị &quot;đạt / chưa đạt&quot; trên KPI card.
        </span>
      }
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/admin/reports/employee-productivity"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-700 dark:hover:text-indigo-400"
          >
            ← Báo cáo nhân viên
          </Link>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {showCreate ? "Đóng form" : "Thêm target"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {showCreate ? (
          <CreateForm
            defaultRole={filterRole}
            onClose={() => setShowCreate(false)}
          />
        ) : null}

        {/* Filter */}
        <section className="flex items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <Field label="Bộ phận">
            <Select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="min-w-[200px]"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </section>

        {/* List */}
        <div className="flex flex-col gap-2">
          {targetsQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-8 text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
            </div>
          ) : targets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Bộ phận này chưa có KPI target nào — nhấn &quot;Thêm
              target&quot; để tạo.
            </div>
          ) : (
            <ul className="space-y-2">
              {targets.map((t) => (
                <TargetRow key={t.id} target={t} />
              ))}
            </ul>
          )}
        </div>
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
      <label className="block text-[11px] font-semibold uppercase tracking-normal text-zinc-500 dark:text-zinc-400">
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
        "h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm tracking-normal text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/40",
        className,
      )}
    />
  );
}

function CreateForm({
  defaultRole,
  onClose,
}: {
  defaultRole: string;
  onClose: () => void;
}) {
  const create = useCreateReportTarget();
  const [roleCode, setRoleCode] = React.useState(defaultRole);
  const [metricId, setMetricId] = React.useState(
    METRIC_OPTIONS[defaultRole]?.[0]?.id ?? "",
  );
  const [periodType, setPeriodType] = React.useState<
    "monthly" | "quarterly" | "yearly"
  >("monthly");
  const [targetValue, setTargetValue] = React.useState("");
  const [comparison, setComparison] = React.useState<"gte" | "lte">("gte");
  const [notes, setNotes] = React.useState("");

  const metricOptions = METRIC_OPTIONS[roleCode] ?? [];

  React.useEffect(() => {
    const first = METRIC_OPTIONS[roleCode]?.[0]?.id;
    if (first) setMetricId(first);
  }, [roleCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(targetValue);
    if (!Number.isFinite(v) || v < 0) {
      toast.error("Target value phải ≥ 0");
      return;
    }
    if (!metricId) {
      toast.error("Vui lòng chọn metric");
      return;
    }
    try {
      await create.mutateAsync({
        roleCode,
        metricId,
        periodType,
        targetValue: v,
        comparison,
        notes: notes.trim() || null,
      });
      toast.success("Đã tạo KPI target");
      onClose();
    } catch (err) {
      toast.error((err as Error).message ?? "Tạo target thất bại");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm dark:border-indigo-800 dark:bg-indigo-950/20"
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Thêm KPI target
        </h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Đặt mục tiêu cho 1 metric trong 1 chu kỳ.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Field label="Bộ phận">
          <Select
            value={roleCode}
            onChange={(e) => setRoleCode(e.target.value)}
            className="w-full"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Metric">
          <Select
            value={metricId}
            onChange={(e) => setMetricId(e.target.value)}
            className="w-full"
          >
            {metricOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chu kỳ">
          <Select
            value={periodType}
            onChange={(e) =>
              setPeriodType(
                e.target.value as "monthly" | "quarterly" | "yearly",
              )
            }
            className="w-full"
          >
            <option value="monthly">Tháng</option>
            <option value="quarterly">Quý</option>
            <option value="yearly">Năm</option>
          </Select>
        </Field>
        <Field label="Target value">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder="VD: 5"
            required
            className="h-9"
          />
        </Field>
        <Field label="So sánh">
          <Select
            value={comparison}
            onChange={(e) =>
              setComparison(e.target.value as "gte" | "lte")
            }
            className="w-full"
          >
            <option value="gte">≥ (càng cao càng tốt)</option>
            <option value="lte">≤ (càng thấp càng tốt)</option>
          </Select>
        </Field>
        <Field label="Ghi chú">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tuỳ chọn"
            maxLength={500}
            className="h-9"
          />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          Lưu target
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}

function TargetRow({ target }: { target: ReportTargetRow }) {
  const update = useUpdateReportTarget(target.id);
  const del = useDeleteReportTarget();
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(target.targetValue);
  const [notes, setNotes] = React.useState(target.notes ?? "");

  const metricLabel =
    Object.values(METRIC_OPTIONS)
      .flat()
      .find((m) => m.id === target.metricId)?.label ?? target.metricId;

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        targetValue: Number(val),
        notes: notes.trim() || null,
      });
      toast.success("Đã cập nhật");
      setEditing(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Xoá target ${metricLabel}?`)) return;
    try {
      await del.mutateAsync(target.id);
      toast.success("Đã xoá target");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-normal text-zinc-500 dark:text-zinc-400">
              {target.roleCode ?? "ALL"}
            </span>
            <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {metricLabel}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700">
              {target.periodType === "monthly"
                ? "Tháng"
                : target.periodType === "quarterly"
                  ? "Quý"
                  : "Năm"}
            </span>
          </div>
          {target.notes ? (
            <p className="mt-0.5 text-[11px] italic text-zinc-500 dark:text-zinc-400">
              {target.notes}
            </p>
          ) : null}
        </div>

        {editing ? (
          <>
            <Input
              type="number"
              step="0.01"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="w-28 text-right tabular-nums"
            />
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="w-48"
              maxLength={500}
            />
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={update.isPending}
            >
              Lưu
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              ✕
            </Button>
          </>
        ) : (
          <>
            <div
              className={cn(
                "rounded-lg px-3 py-1.5 text-right ring-1 ring-inset",
                target.comparison === "gte"
                  ? "bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800"
                  : "bg-amber-50 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-800",
              )}
            >
              <div className="text-[10px] font-semibold uppercase tracking-normal text-zinc-500 dark:text-zinc-400">
                Target {target.comparison === "gte" ? "≥" : "≤"}
              </div>
              <div className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {Number(target.targetValue).toLocaleString("vi-VN")}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setVal(target.targetValue);
                setNotes(target.notes ?? "");
                setEditing(true);
              }}
            >
              Sửa
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleDelete()}
              disabled={del.isPending}
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              aria-label="Xoá"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
