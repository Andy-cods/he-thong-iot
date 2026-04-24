"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Factory,
  Loader2,
  Package,
  Pencil,
  Plus,
} from "lucide-react";
import {
  BOM_SNAPSHOT_STATE_LABELS,
  BOM_SNAPSHOT_STATE_TONES,
} from "@iot/shared";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { OrderProductionSummary, WorkOrderSummaryItem } from "@/app/api/orders/[code]/production-summary/route";
import { ProductionOverviewCards } from "@/components/orders/ProductionOverviewCards";
import { OrderNotesSection } from "@/components/orders/OrderNotesSection";
import { SnapshotLineEditDrawer } from "@/components/orders/SnapshotLineEditDrawer";
import { useSnapshotLines, type SnapshotLineRow } from "@/hooks/useSnapshots";
import type { SalesOrderRow } from "@/hooks/useOrders";

/**
 * V1.9 Phase 3 — ProductionProgressPanel refactor.
 *
 * 4 sections:
 *   1. Tổng quan production (ProductionOverviewCards).
 *   2. Snapshot vật liệu (editable table → SnapshotLineEditDrawer).
 *   3. Work Orders linked (read-only table; click → /work-orders/[id]).
 *   4. Ghi chú + Activity log (OrderNotesSection).
 */

const WO_STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  DRAFT: { label: "Nháp", className: "bg-zinc-100 text-zinc-600" },
  QUEUED: { label: "Đợi", className: "bg-zinc-200 text-zinc-700" },
  RELEASED: { label: "Phát lệnh", className: "bg-blue-50 text-blue-700" },
  IN_PROGRESS: { label: "Đang chạy", className: "bg-indigo-100 text-indigo-800" },
  PAUSED: { label: "Tạm dừng", className: "bg-amber-100 text-amber-800" },
  COMPLETED: { label: "Hoàn thành", className: "bg-emerald-100 text-emerald-800" },
  CANCELLED: { label: "Huỷ", className: "bg-red-100 text-red-700" },
};

interface ProductionProgressPanelProps {
  order: SalesOrderRow;
  orderCode: string;
  data: OrderProductionSummary | null;
  loading: boolean;
  error?: string | null;
  /** Có quyền edit snapshot line / notes không. */
  canEdit: boolean;
  /** Admin override state machine. */
  isAdmin: boolean;
}

export function ProductionProgressPanel({
  order,
  orderCode,
  data,
  loading,
  error,
  canEdit,
  isAdmin,
}: ProductionProgressPanelProps) {
  const [editRow, setEditRow] = React.useState<SnapshotLineRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Load snapshot lines cho inline edit table (reuse hook — 500 rows max đủ cho tab).
  const snapshotLinesQuery = useSnapshotLines(orderCode, {
    page: 1,
    pageSize: 500,
  });
  const snapshotRows = snapshotLinesQuery.data?.data ?? [];

  const handleEditLine = React.useCallback((row: SnapshotLineRow) => {
    setEditRow(row);
    setDrawerOpen(true);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2
          className="h-5 w-5 animate-spin text-zinc-400"
          aria-hidden="true"
        />
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

  return (
    <div className="flex flex-col gap-4">
      {/* Section 1: KPI cards */}
      <ProductionOverviewCards order={order} summary={data} />

      {/* Section 2: Snapshot material table (editable) */}
      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
          <Package className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <h3 className="text-sm font-medium text-zinc-900">
            Vật liệu (snapshot)
          </h3>
          {snapshotRows.length > 0 && (
            <span className="ml-auto text-xs text-zinc-500">
              {snapshotRows.length} line{" "}
              {!canEdit && (
                <span className="text-[11px] text-amber-600">
                  (chỉ đọc — không có quyền sửa)
                </span>
              )}
            </span>
          )}
        </div>

        {snapshotLinesQuery.isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2
              className="h-4 w-4 animate-spin text-zinc-400"
              aria-hidden="true"
            />
          </div>
        ) : snapshotRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            Chưa có snapshot lines — hãy explode BOM ở tab Snapshot Board.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <th scope="col" className="px-4 py-2 text-left">
                    SKU
                  </th>
                  <th scope="col" className="px-4 py-2 text-left">
                    Tên
                  </th>
                  <th scope="col" className="px-4 py-2 text-right">
                    Required
                  </th>
                  <th scope="col" className="px-4 py-2 text-right">
                    Available
                  </th>
                  <th scope="col" className="px-4 py-2 text-right">
                    Issued
                  </th>
                  <th scope="col" className="px-4 py-2 text-right">
                    Shortage
                  </th>
                  <th scope="col" className="px-4 py-2 text-left">
                    Trạng thái
                  </th>
                  <th scope="col" className="px-4 py-2 text-right">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshotRows.map((row) => (
                  <SnapshotRow
                    key={row.id}
                    row={row}
                    canEdit={canEdit}
                    onEdit={() => handleEditLine(row)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 3: Work Orders */}
      <WorkOrdersSection summary={data} orderCode={orderCode} />

      {/* Section 4: Notes + Activity */}
      <OrderNotesSection
        order={order}
        orderCode={orderCode}
        readOnly={!canEdit}
      />

      <SnapshotLineEditDrawer
        open={drawerOpen}
        onOpenChange={(v) => {
          setDrawerOpen(v);
          if (!v) setEditRow(null);
        }}
        orderCode={orderCode}
        row={editRow}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function SnapshotRow({
  row,
  canEdit,
  onEdit,
}: {
  row: SnapshotLineRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const tone = BOM_SNAPSHOT_STATE_TONES[row.state];
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : tone === "info"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : tone === "shortage"
              ? "border-orange-200 bg-orange-50 text-orange-700"
              : "border-zinc-200 bg-zinc-100 text-zinc-700";

  const shortage = row.remainingShortQty !== null ? Number(row.remainingShortQty) : 0;

  return (
    <tr className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50">
      <td className="px-4 py-2 font-mono text-xs text-indigo-700">
        {row.componentSku}
      </td>
      <td className="px-4 py-2 text-xs text-zinc-700" title={row.componentName}>
        <span className="line-clamp-1 max-w-[280px]">{row.componentName}</span>
      </td>
      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-zinc-800">
        {Number(row.requiredQty).toLocaleString("vi-VN")}
      </td>
      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-emerald-700">
        {Number(row.qcPassQty).toLocaleString("vi-VN")}
      </td>
      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-zinc-600">
        {Number(row.issuedQty).toLocaleString("vi-VN")}
      </td>
      <td
        className={cn(
          "px-4 py-2 text-right font-mono text-xs tabular-nums",
          shortage > 0 ? "text-red-600 font-medium" : "text-zinc-400",
        )}
      >
        {shortage > 0 ? shortage.toLocaleString("vi-VN") : "—"}
      </td>
      <td className="px-4 py-2">
        <span
          className={cn(
            "inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-medium",
            toneClass,
          )}
        >
          {BOM_SNAPSHOT_STATE_LABELS[row.state]}
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        {canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-6 px-1.5 text-[11px]"
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            Sửa
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

function WorkOrdersSection({
  summary,
  orderCode,
}: {
  summary: OrderProductionSummary | null;
  orderCode: string;
}) {
  const hasWOs = (summary?.workOrders?.length ?? 0) > 0;

  return (
    <section className="rounded-md border border-zinc-200 bg-white">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
        <Factory className="h-4 w-4 text-zinc-500" aria-hidden="true" />
        <h3 className="text-sm font-medium text-zinc-900">Work Orders</h3>
        {hasWOs && (
          <span className="text-xs text-zinc-400">
            {summary!.workOrders.length} WO
          </span>
        )}
        <Link
          href={`/work-orders/new?orderCode=${encodeURIComponent(orderCode)}`}
          className="ml-auto"
        >
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            <Plus className="h-3 w-3" aria-hidden="true" />
            Tạo WO
          </Button>
        </Link>
      </div>
      {!hasWOs ? (
        <div className="px-4 py-6 text-center text-sm text-zinc-500">
          Chưa có Work Order nào cho đơn hàng này.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <th scope="col" className="px-4 py-2 text-left">
                  Mã WO
                </th>
                <th scope="col" className="px-4 py-2 text-left">
                  Trạng thái
                </th>
                <th scope="col" className="px-4 py-2 text-left">
                  Ưu tiên
                </th>
                <th scope="col" className="px-4 py-2 text-left">
                  Bắt đầu
                </th>
                <th scope="col" className="px-4 py-2 text-left">
                  Kết thúc
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-left min-w-[160px]"
                >
                  Tiến độ
                </th>
                <th scope="col" className="px-4 py-2 text-right">
                  &nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {summary!.workOrders.map((wo) => (
                <WoRow key={wo.id} wo={wo} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function WoRow({ wo }: { wo: WorkOrderSummaryItem }) {
  const badge = WO_STATUS_BADGE[wo.status] ?? {
    label: wo.status,
    className: "bg-zinc-100 text-zinc-600",
  };

  return (
    <tr className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50">
      <td className="px-4 py-2 font-mono text-xs font-medium text-indigo-700">
        <Link
          href={`/work-orders/${wo.id}`}
          className="hover:underline"
        >
          {wo.woCode}
        </Link>
      </td>
      <td className="px-4 py-2">
        <span
          className={cn(
            "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
            badge.className,
          )}
        >
          {badge.label}
        </span>
      </td>
      <td className="px-4 py-2 text-xs text-zinc-600">{wo.priority}</td>
      <td className="px-4 py-2 font-mono text-xs text-zinc-600">
        {wo.plannedStartDate
          ? formatDate(wo.plannedStartDate, "dd/MM/yyyy")
          : "—"}
      </td>
      <td className="px-4 py-2 font-mono text-xs text-zinc-600">
        {wo.plannedEndDate
          ? formatDate(wo.plannedEndDate, "dd/MM/yyyy")
          : "—"}
      </td>
      <td className="px-4 py-2">
        <WoProgressBar
          pct={wo.progressPct}
          completed={wo.completedQty}
          total={wo.totalQty}
        />
      </td>
      <td className="px-4 py-2 text-right">
        <Link href={`/work-orders/${wo.id}`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px]"
            aria-label={`Xem chi tiết ${wo.woCode}`}
          >
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Button>
        </Link>
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
        ? "bg-indigo-500"
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
      <span className="font-mono text-[11px] tabular-nums text-zinc-600">
        {completed}/{total}
      </span>
    </div>
  );
}
