"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";
import {
  useWorkOrdersList,
  type WorkOrderStatus,
} from "@/hooks/useWorkOrders";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  DRAFT: "Nháp",
  QUEUED: "Chờ",
  RELEASED: "Đã phát",
  IN_PROGRESS: "Đang SX",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

const WO_FILTER_KEYS: WorkOrderStatus[] = [
  "DRAFT",
  "QUEUED",
  "RELEASED",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
];

function statusToBadge(status: WorkOrderStatus): BadgeStatus {
  switch (status) {
    case "DRAFT":
      return "draft";
    case "QUEUED":
    case "RELEASED":
      return "info";
    case "IN_PROGRESS":
    case "PAUSED":
      return "warning";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
      return "danger";
    default:
      return "info";
  }
}

export function WorkOrdersPanel({ bomId }: { bomId: string }) {
  const [statuses, setStatuses] = React.useState<WorkOrderStatus[]>([]);

  const query = useWorkOrdersList({
    bomTemplateId: bomId,
    status: statuses.length > 0 ? statuses : undefined,
    page: 1,
    pageSize: 50,
  });
  const rows = query.data?.data ?? [];

  const toggleStatus = (s: WorkOrderStatus) => {
    setStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Inline toolbar — filter chips + create button */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {WO_FILTER_KEYS.map((s) => {
            const active = statuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={cn(
                  "inline-flex h-6 items-center rounded-sm border px-2 text-[11px] font-medium transition-colors",
                  active
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100",
                )}
                aria-pressed={active}
              >
                {WO_STATUS_LABELS[s]}
              </button>
            );
          })}
          {statuses.length > 0 ? (
            <button
              type="button"
              onClick={() => setStatuses([])}
              className="ml-1 text-[10px] text-zinc-500 underline hover:text-zinc-700"
            >
              Bỏ lọc
            </button>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            {rows.length} WO
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled
            title="Tạo WO cần chọn đơn hàng + snapshot lines — vui lòng vào tab Snapshot Board của 1 đơn để tạo (tránh nhập sai data)."
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Tạo lệnh SX
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-xs text-zinc-500">
            {statuses.length > 0
              ? "Không có WO nào match filter."
              : "Chưa có Work Order cho BOM này."}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm">
              <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-1.5 text-left font-medium">Mã WO</th>
                <th className="px-3 py-1.5 text-left font-medium">Đơn hàng</th>
                <th className="px-3 py-1.5 text-right font-medium">KH</th>
                <th className="px-3 py-1.5 text-right font-medium">Đã SX</th>
                <th className="px-3 py-1.5 text-left font-medium">
                  Trạng thái
                </th>
                <th className="px-3 py-1.5 text-left font-medium">Due</th>
                <th className="px-3 py-1.5 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => {
                const planned = Number(row.plannedQty);
                const good = Number(row.goodQty);
                const pct =
                  planned > 0
                    ? Math.min(100, Math.round((good / planned) * 100))
                    : 0;
                return (
                  <tr key={row.id} className="h-8 hover:bg-zinc-50">
                    <td className="px-3 font-mono text-[11px] font-semibold text-indigo-600">
                      {row.woNo}
                    </td>
                    <td className="px-3 font-mono text-[11px] text-zinc-700">
                      {row.orderNo ?? "—"}
                    </td>
                    <td className="px-3 text-right font-mono tabular-nums text-zinc-700">
                      {formatNumber(planned)}
                    </td>
                    <td className="px-3 text-right font-mono tabular-nums text-zinc-700">
                      {formatNumber(good)}{" "}
                      <span className="text-[10px] text-zinc-400">
                        ({pct}%)
                      </span>
                    </td>
                    <td className="px-3">
                      <StatusBadge
                        status={statusToBadge(row.status)}
                        size="sm"
                        label={WO_STATUS_LABELS[row.status]}
                      />
                    </td>
                    <td className="px-3 text-zinc-500">
                      {row.plannedEnd
                        ? formatDate(row.plannedEnd, "dd/MM/yyyy")
                        : "—"}
                    </td>
                    <td className="px-1">
                      <Link
                        href={`/work-orders/${row.id}`}
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600"
                        title="Mở chi tiết WO"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
