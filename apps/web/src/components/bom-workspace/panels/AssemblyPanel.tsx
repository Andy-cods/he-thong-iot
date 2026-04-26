"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Wrench } from "lucide-react";
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

function statusToBadge(s: WorkOrderStatus): BadgeStatus {
  switch (s) {
    case "IN_PROGRESS":
      return "warning";
    case "PAUSED":
      return "info";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
      return "danger";
    default:
      return "info";
  }
}

/**
 * V1.8 batch 4 — Assembly panel: reuse work-orders API filter
 * bomTemplateId + status IN_PROGRESS/COMPLETED/PAUSED → aggregate progress
 * (tổng kế hoạch vs good) + list row.
 *
 * Rationale: chưa có dedicated assembly entity riêng. WO hoàn thành chính là
 * "thành phẩm đã lắp ráp". Panel reuse data tồn tại thay vì spin up 1 API mới.
 */
export function AssemblyPanel({ bomId }: { bomId: string }) {
  const query = useWorkOrdersList({
    bomTemplateId: bomId,
    status: ["IN_PROGRESS", "PAUSED", "COMPLETED"],
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
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-xs text-zinc-500">
        <Wrench className="h-5 w-5 text-zinc-300" aria-hidden />
        <span>Chưa có lệnh SX đang lắp ráp cho BOM này.</span>
        <span className="text-[10px] text-zinc-400">
          Lắp ráp xuất hiện khi có WO ở trạng thái IN_PROGRESS / PAUSED /
          COMPLETED. Xem tab Lệnh SX để tạo WO.
        </span>
      </div>
    );
  }

  const totalPlanned = rows.reduce((s, r) => s + Number(r.plannedQty), 0);
  const totalGood = rows.reduce((s, r) => s + Number(r.goodQty), 0);
  const totalScrap = rows.reduce((s, r) => s + Number(r.scrapQty), 0);
  const overallPct =
    totalPlanned > 0
      ? Math.min(100, Math.round((totalGood / totalPlanned) * 100))
      : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Aggregate progress header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
        <div className="flex items-center gap-4">
          <span>
            <span className="uppercase tracking-wide text-[10px] text-zinc-500">
              Kế hoạch
            </span>{" "}
            <span className="font-mono font-semibold text-zinc-800">
              {formatNumber(totalPlanned)}
            </span>
          </span>
          <span>
            <span className="uppercase tracking-wide text-[10px] text-zinc-500">
              Đã SX
            </span>{" "}
            <span className="font-mono font-semibold text-emerald-700">
              {formatNumber(totalGood)}
            </span>
          </span>
          {totalScrap > 0 && (
            <span>
              <span className="uppercase tracking-wide text-[10px] text-zinc-500">
                Phế
              </span>{" "}
              <span className="font-mono font-semibold text-red-600">
                {formatNumber(totalScrap)}
              </span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200"
              aria-hidden
            >
              <span
                className="block h-full rounded-full bg-indigo-500"
                style={{ width: `${overallPct}%` }}
              />
            </span>
            <span className="font-mono text-[10px] font-semibold text-indigo-700">
              {overallPct}%
            </span>
          </span>
        </div>
        <Link
          href={`/work-orders?bomTemplateId=${bomId}`}
          className="text-[10px] text-indigo-600 hover:underline"
        >
          Xem tất cả WO
        </Link>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-[5] bg-white">
            <tr className="border-b border-zinc-100 text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-1 text-left font-medium">Mã WO</th>
              <th className="px-3 py-1 text-left font-medium">Đơn hàng</th>
              <th className="px-3 py-1 text-right font-medium">KH</th>
              <th className="px-3 py-1 text-right font-medium">Đã SX</th>
              <th className="px-3 py-1 text-left font-medium">% tiến độ</th>
              <th className="px-3 py-1 text-left font-medium">Trạng thái</th>
              <th className="px-3 py-1 text-left font-medium">Hoàn thành</th>
              <th className="px-3 py-1 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
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
                  <td className="px-3 text-right font-mono tabular-nums text-emerald-700">
                    {formatNumber(good)}
                  </td>
                  <td className="px-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-1 w-16 overflow-hidden rounded-full bg-zinc-200"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full bg-indigo-500"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-zinc-600">
                        {pct}%
                      </span>
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
                    {row.completedAt
                      ? formatDate(row.completedAt, "dd/MM/yyyy")
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
    </div>
  );
}
