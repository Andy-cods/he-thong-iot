"use client";

import * as React from "react";
import {
  Boxes,
  CheckCircle2,
  Factory,
  Package,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderProductionSummary } from "@/app/api/orders/[code]/production-summary/route";
import type { SalesOrderRow } from "@/hooks/useOrders";

/**
 * V1.9 Phase 3 — 5 KPI cards tổng quan sản xuất cho tab Sản xuất:
 *   1. Tổng SL đơn
 *   2. Đã SX (good qty cộng dồn từ WO)
 *   3. Phế (scrap từ WO)
 *   4. Vật liệu sẵn sàng (material ready %)
 *   5. ETA (deadline order)
 */

interface ProductionOverviewCardsProps {
  order: SalesOrderRow;
  summary: OrderProductionSummary | null;
}

export function ProductionOverviewCards({
  order,
  summary,
}: ProductionOverviewCardsProps) {
  const orderQty = Number(order.orderQty ?? 0);
  const goodQty = React.useMemo(() => {
    if (!summary?.workOrders) return 0;
    return summary.workOrders.reduce((s, w) => s + (w.completedQty ?? 0), 0);
  }, [summary]);
  const totalPlanned = React.useMemo(() => {
    if (!summary?.workOrders) return 0;
    return summary.workOrders.reduce((s, w) => s + (w.totalQty ?? 0), 0);
  }, [summary]);
  const producedPct =
    orderQty > 0 ? Math.round((goodQty / orderQty) * 100) : 0;
  const materialReadyPct = summary?.snapshotSummary?.materialReadyPct ?? 0;
  const shortageCount = summary?.snapshotSummary?.shortage ?? 0;

  const dueLabel = order.dueDate
    ? new Date(order.dueDate).toLocaleDateString("vi-VN")
    : "—";

  const overdue =
    order.dueDate !== null &&
    new Date(order.dueDate).getTime() < Date.now() &&
    order.status !== "FULFILLED" &&
    order.status !== "CLOSED";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <KpiCard
        icon={<Boxes className="h-4 w-4 text-zinc-500" aria-hidden="true" />}
        label="Tổng SL đơn"
        value={orderQty.toLocaleString("vi-VN")}
        hint={totalPlanned > 0 ? `WO plan ${totalPlanned}` : undefined}
      />
      <KpiCard
        icon={
          <CheckCircle2
            className="h-4 w-4 text-emerald-600"
            aria-hidden="true"
          />
        }
        label="Đã SX (đạt)"
        value={goodQty.toLocaleString("vi-VN")}
        hint={`${producedPct}% đơn`}
        valueClass={producedPct >= 100 ? "text-emerald-700" : undefined}
        progress={producedPct}
      />
      <KpiCard
        icon={
          <Factory className="h-4 w-4 text-indigo-500" aria-hidden="true" />
        }
        label="Số WO"
        value={String(summary?.workOrders?.length ?? 0)}
        hint={
          summary?.workOrders && summary.workOrders.length > 0
            ? `${summary.workOrders.filter((w) => w.status === "IN_PROGRESS").length} đang chạy`
            : "Chưa có WO"
        }
      />
      <KpiCard
        icon={
          <Package className="h-4 w-4 text-blue-500" aria-hidden="true" />
        }
        label="Vật liệu sẵn sàng"
        value={`${materialReadyPct}%`}
        hint={
          shortageCount > 0
            ? `${shortageCount} line thiếu`
            : summary?.snapshotSummary
              ? `${summary.snapshotSummary.totalLines} line`
              : "Chưa explode"
        }
        valueClass={
          materialReadyPct >= 80
            ? "text-emerald-700"
            : materialReadyPct >= 40
              ? "text-amber-700"
              : "text-red-700"
        }
        progress={materialReadyPct}
      />
      <KpiCard
        icon={
          overdue ? (
            <TriangleAlert
              className="h-4 w-4 text-red-600"
              aria-hidden="true"
            />
          ) : (
            <Timer className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          )
        }
        label="ETA"
        value={dueLabel}
        hint={overdue ? "Trễ hạn" : undefined}
        valueClass={overdue ? "text-red-700" : undefined}
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  progress,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  progress?: number;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums text-zinc-900",
          valueClass,
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-zinc-500">{hint}</div>}
      {progress !== undefined && (
        <div
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100"
          role="progressbar"
          aria-valuenow={Math.max(0, Math.min(100, progress))}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              "h-full transition-all",
              progress >= 80
                ? "bg-emerald-500"
                : progress >= 40
                  ? "bg-indigo-500"
                  : "bg-zinc-400",
            )}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
