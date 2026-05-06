"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

// Metric IDs khớp với repo employeeProductivity.ts
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

  const targetsQuery = useReportTargets({ roleCode: filterRole, isActive: true });
  const targets = targetsQuery.data?.data ?? [];

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <Link href="/admin" className="hover:text-zinc-900 hover:underline">
            Quản trị
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">KPI Targets</span>
        </nav>
        <div className="mt-1.5 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
            <Target className="h-5 w-5 text-indigo-600" />
            KPI Baselines / Mục tiêu năng suất
          </h1>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/reports/employee-productivity"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
            >
              ← Báo cáo nhân viên
            </Link>
            <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="h-3.5 w-3.5" />
              {showCreate ? "Đóng form" : "Thêm target"}
            </Button>
          </div>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">
          Set baseline cho mỗi (bộ phận × metric × period). Khi báo cáo có
          target → hiển thị "đạt / chưa đạt" trên KPI card.
        </p>
      </header>

      {showCreate ? (
        <CreateForm
          defaultRole={filterRole}
          onClose={() => setShowCreate(false)}
        />
      ) : null}

      {/* Filter */}
      <div className="flex items-end gap-3 border-b border-zinc-200 bg-white px-6 py-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Bộ phận</Label>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="h-9 min-w-[200px] rounded-md border border-zinc-200 bg-white px-3 text-[13px]"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="mx-auto w-full max-w-[1100px] p-6">
        {targetsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        ) : targets.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500">
            Bộ phận này chưa có KPI target nào — nhấn "Thêm target" để tạo.
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
  const [periodType, setPeriodType] = React.useState<"monthly" | "quarterly" | "yearly">("monthly");
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
      className="border-b border-zinc-200 bg-indigo-50/30 px-6 py-4"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Bộ phận</Label>
          <select
            value={roleCode}
            onChange={(e) => setRoleCode(e.target.value)}
            className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-[13px]"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Metric</Label>
          <select
            value={metricId}
            onChange={(e) => setMetricId(e.target.value)}
            className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-[13px]"
          >
            {metricOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Period</Label>
          <select
            value={periodType}
            onChange={(e) =>
              setPeriodType(e.target.value as "monthly" | "quarterly" | "yearly")
            }
            className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-[13px]"
          >
            <option value="monthly">Tháng</option>
            <option value="quarterly">Quý</option>
            <option value="yearly">Năm</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Target value</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder="VD: 5"
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Comparison</Label>
          <select
            value={comparison}
            onChange={(e) => setComparison(e.target.value as "gte" | "lte")}
            className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-[13px]"
          >
            <option value="gte">≥ (càng cao càng tốt)</option>
            <option value="lte">≤ (càng thấp càng tốt)</option>
          </select>
        </div>
        <div className="space-y-1 md:col-span-2 lg:col-span-1">
          <Label className="text-[10px] uppercase">Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tùy chọn"
            maxLength={500}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
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
    <li className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] uppercase text-zinc-500">
              {target.roleCode ?? "ALL"}
            </span>
            <span className="text-sm font-semibold text-zinc-900">
              {metricLabel}
            </span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
              {target.periodType === "monthly"
                ? "Tháng"
                : target.periodType === "quarterly"
                  ? "Quý"
                  : "Năm"}
            </span>
          </div>
          {target.notes ? (
            <p className="mt-0.5 text-[11px] italic text-zinc-500">
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
            <Button size="sm" onClick={() => void handleSave()} disabled={update.isPending}>
              Lưu
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              ✕
            </Button>
          </>
        ) : (
          <>
            <div
              className={cn(
                "rounded px-2.5 py-1 text-right",
                target.comparison === "gte" ? "bg-emerald-50" : "bg-amber-50",
              )}
            >
              <div className="text-[9px] uppercase text-zinc-500">
                Target {target.comparison === "gte" ? "≥" : "≤"}
              </div>
              <div className="font-mono text-sm font-semibold tabular-nums text-zinc-900">
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
              className="text-rose-600 hover:bg-rose-50"
              aria-label="Xoá"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
