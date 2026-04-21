"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
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

const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  DRAFT: "Nháp",
  QUEUED: "Chờ",
  RELEASED: "Đã phát",
  IN_PROGRESS: "Đang SX",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

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
  const query = useWorkOrdersList({
    bomTemplateId: bomId,
    page: 1,
    pageSize: 50,
  });
  const rows = query.data?.data ?? [];

  if (query.isLoading) {
    return (
      <div className="space-y-1 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-xs text-zinc-500">
        Chưa có Work Order cho BOM này.
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm">
          <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-1.5 text-left font-medium">Mã WO</th>
            <th className="px-3 py-1.5 text-left font-medium">Đơn hàng</th>
            <th className="px-3 py-1.5 text-right font-medium">KH</th>
            <th className="px-3 py-1.5 text-right font-medium">Đã SX</th>
            <th className="px-3 py-1.5 text-left font-medium">Trạng thái</th>
            <th className="px-3 py-1.5 text-left font-medium">Due</th>
            <th className="px-3 py-1.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const planned = Number(row.plannedQty);
            const good = Number(row.goodQty);
            const pct =
              planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
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
                  <span className="text-[10px] text-zinc-400">({pct}%)</span>
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
    </div>
  );
}
