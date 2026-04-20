"use client";

import * as React from "react";
import { Loader2, Factory, Package, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { OrderProductionSummary, WorkOrderSummaryItem } from "@/app/api/orders/[code]/production-summary/route";

/**
 * ProductionProgressPanel — hiển thị tiến độ sản xuất của 1 order.
 *
 * Section 1: Work Orders list (compact table + progress bar per WO).
 * Section 2: Tình trạng vật liệu BOM (5 state segments).
 * Section 3: Tiến độ lắp ráp (nếu có assembly data).
 */

const WO_STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  DRAFT: { label: "Nháp", className: "bg-zinc-100 text-zinc-600" },
  QUEUED: { label: "Đợi", className: "bg-zinc-200 text-zinc-700" },
  RELEASED: { label: "Phát lệnh", className: "bg-blue-50 text-blue-700" },
  IN_PROGRESS: { label: "Đang chạy", className: "bg-blue-100 text-blue-800" },
  PAUSED: { label: "Tạm dừng", className: "bg-amber-100 text-amber-800" },
  COMPLETED: { label: "Hoàn thành", className: "bg-emerald-100 text-emerald-800" },
  CANCELLED: { label: "Huỷ", className: "bg-red-100 text-red-700" },
};

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "text-zinc-400",
  NORMAL: "text-zinc-600",
  HIGH: "text-amber-600",
  URGENT: "text-red-600 font-semibold",
};

interface ProductionProgressPanelProps {
  data: OrderProductionSummary | null;
  loading: boolean;
  error?: string | null;
}

export function ProductionProgressPanel({
  data,
  loading,
  error,
}: ProductionProgressPanelProps) {
  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
        Chưa có dữ liệu tiến độ sản xuất cho đơn hàng này.
      </div>
    );
  }

  const hasWOs = data.workOrders.length > 0;
  const hasSnapshot = data.snapshotSummary !== null;
  const hasAssembly = data.assemblyProgress !== null;

  return (
    <div className="flex flex-col gap-4">
      {/* Section 1: Work Orders */}
      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
          <Factory className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <h3 className="text-sm font-medium text-zinc-900">Work Orders</h3>
          {hasWOs && (
            <span className="ml-auto text-xs text-zinc-400">
              {data.workOrders.length} WO
            </span>
          )}
        </div>

        {!hasWOs ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">
            Chưa có Work Order nào được tạo cho đơn hàng này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <th scope="col" className="px-4 py-2 text-left">Mã WO</th>
                  <th scope="col" className="px-4 py-2 text-left">Trạng thái</th>
                  <th scope="col" className="px-4 py-2 text-left">Ưu tiên</th>
                  <th scope="col" className="px-4 py-2 text-left">Bắt đầu</th>
                  <th scope="col" className="px-4 py-2 text-left">Kết thúc</th>
                  <th scope="col" className="px-4 py-2 text-left min-w-[140px]">Tiến độ</th>
                </tr>
              </thead>
              <tbody>
                {data.workOrders.map((wo) => (
                  <WoRow key={wo.id} wo={wo} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 2: BOM Material Status */}
      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
          <Package className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <h3 className="text-sm font-medium text-zinc-900">
            Tình trạng vật liệu BOM
          </h3>
          {hasSnapshot && (
            <span className="ml-auto text-xs font-medium text-zinc-700">
              Sẵn sàng:{" "}
              <span
                className={cn(
                  "font-mono",
                  data.snapshotSummary!.materialReadyPct >= 80
                    ? "text-emerald-600"
                    : data.snapshotSummary!.materialReadyPct >= 40
                      ? "text-amber-600"
                      : "text-red-600",
                )}
              >
                {data.snapshotSummary!.materialReadyPct}%
              </span>
            </span>
          )}
        </div>

        {!hasSnapshot ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">
            Chưa có BOM snapshot — hãy explode BOM trước.
          </div>
        ) : (
          <SnapshotSummaryView summary={data.snapshotSummary!} />
        )}
      </section>

      {/* Section 3: Assembly Progress */}
      {hasAssembly && (
        <section className="rounded-md border border-zinc-200 bg-white">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
            <Layers className="h-4 w-4 text-zinc-500" aria-hidden="true" />
            <h3 className="text-sm font-medium text-zinc-900">
              Tiến độ lắp ráp
            </h3>
          </div>
          <div className="px-4 py-4">
            <AssemblyProgressView progress={data.assemblyProgress!} />
          </div>
        </section>
      )}
    </div>
  );
}

function WoRow({ wo }: { wo: WorkOrderSummaryItem }) {
  const badge = WO_STATUS_BADGE[wo.status] ?? {
    label: wo.status,
    className: "bg-zinc-100 text-zinc-600",
  };
  const priorityClass = PRIORITY_BADGE[wo.priority] ?? "text-zinc-600";

  return (
    <tr className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50">
      <td className="px-4 py-2.5 font-mono text-xs font-medium text-zinc-900">
        {wo.woCode}
      </td>
      <td className="px-4 py-2.5">
        <span
          className={cn(
            "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium",
            badge.className,
          )}
        >
          {badge.label}
        </span>
      </td>
      <td className={cn("px-4 py-2.5 text-xs", priorityClass)}>
        {wo.priority}
      </td>
      <td className="px-4 py-2.5 text-xs text-zinc-500">
        {wo.plannedStartDate
          ? formatDate(wo.plannedStartDate, "dd/MM/yyyy")
          : "—"}
      </td>
      <td className="px-4 py-2.5 text-xs text-zinc-500">
        {wo.plannedEndDate
          ? formatDate(wo.plannedEndDate, "dd/MM/yyyy")
          : "—"}
      </td>
      <td className="px-4 py-2.5">
        <WoProgressBar pct={wo.progressPct} completed={wo.completedQty} total={wo.totalQty} />
      </td>
    </tr>
  );
}

function WoProgressBar({
  pct,
  completed,
  total,
}: {
  pct: number;
  completed: number;
  total: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fillColor =
    clamped >= 80
      ? "bg-emerald-500"
      : clamped >= 40
        ? "bg-blue-500"
        : "bg-zinc-400";

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-24 shrink-0 rounded-full bg-zinc-200"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Tiến độ ${clamped}%`}
      >
        <div
          className={cn("h-full rounded-full transition-all", fillColor)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-zinc-600">
        {completed}/{total}
      </span>
    </div>
  );
}

function SnapshotSummaryView({
  summary,
}: {
  summary: NonNullable<OrderProductionSummary["snapshotSummary"]>;
}) {
  const segments = [
    {
      label: "Khả dụng",
      count: summary.available,
      color: "bg-emerald-500",
      textColor: "text-emerald-700",
    },
    {
      label: "Đã reserve",
      count: summary.reserved,
      color: "bg-indigo-500",
      textColor: "text-indigo-700",
    },
    {
      label: "Đã xuất",
      count: summary.issued,
      color: "bg-blue-500",
      textColor: "text-blue-700",
    },
    {
      label: "Đã lắp",
      count: summary.assembled,
      color: "bg-zinc-400",
      textColor: "text-zinc-600",
    },
    {
      label: "Thiếu hàng",
      count: summary.shortage,
      color: "bg-red-500",
      textColor: "text-red-700",
    },
  ];

  const total = summary.totalLines;

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Stacked progress bar */}
      {total > 0 && (
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100">
          {segments.map((seg) => {
            const w = Math.round((seg.count / total) * 100);
            if (w === 0) return null;
            return (
              <div
                key={seg.label}
                className={cn("h-full transition-all", seg.color)}
                style={{ width: `${w}%` }}
                title={`${seg.label}: ${seg.count}`}
              />
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-xs">
            <span
              className={cn("inline-block h-2.5 w-2.5 rounded-sm", seg.color)}
            />
            <span className="text-zinc-500">{seg.label}</span>
            <span className={cn("font-mono tabular-nums font-medium", seg.textColor)}>
              {seg.count}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 ml-auto">
          Tổng: <span className="font-mono font-medium text-zinc-700">{total}</span>
        </div>
      </div>
    </div>
  );
}

function AssemblyProgressView({
  progress,
}: {
  progress: NonNullable<OrderProductionSummary["assemblyProgress"]>;
}) {
  const pct = Math.max(0, Math.min(100, progress.progressPct));
  const fillColor =
    pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-blue-500" : "bg-zinc-400";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-600">Scan / Mục tiêu</span>
        <span className="font-mono tabular-nums text-zinc-900">
          {progress.totalScanned} / {progress.totalRequired}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Lắp ráp ${pct}%`}
      >
        <div
          className={cn("h-full rounded-full transition-all", fillColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-right text-xs font-mono text-zinc-500">{pct}%</p>
    </div>
  );
}
