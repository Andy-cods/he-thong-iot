"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  SALES_ORDER_STATUS_LABELS,
  type SalesOrderStatus,
} from "@iot/shared";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";
import { useOrdersList } from "@/hooks/useOrders";
import { formatDate, formatNumber } from "@/lib/format";

function statusToBadge(status: SalesOrderStatus): BadgeStatus {
  switch (status) {
    case "DRAFT":
      return "draft";
    case "CONFIRMED":
      return "info";
    case "SNAPSHOTTED":
    case "IN_PROGRESS":
      return "warning";
    case "FULFILLED":
      return "success";
    case "CLOSED":
      return "inactive";
    case "CANCELLED":
      return "danger";
    default:
      return "info";
  }
}

export function OrdersPanel({ bomId }: { bomId: string }) {
  const query = useOrdersList({ bomTemplateId: bomId, page: 1, pageSize: 50 });
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
        Chưa có đơn hàng dùng BOM này.
        <Link
          href={`/orders/new?bomTemplateId=${bomId}`}
          className="ml-2 text-indigo-600 hover:underline"
        >
          Tạo đơn mới →
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm">
          <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-1.5 text-left font-medium">Mã đơn</th>
            <th className="px-3 py-1.5 text-left font-medium">Khách hàng</th>
            <th className="px-3 py-1.5 text-right font-medium">SL</th>
            <th className="px-3 py-1.5 text-left font-medium">Due</th>
            <th className="px-3 py-1.5 text-left font-medium">Trạng thái</th>
            <th className="px-3 py-1.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr
              key={row.id}
              className="h-8 transition-colors hover:bg-zinc-50"
            >
              <td className="px-3 font-mono text-[11px] font-semibold text-indigo-600">
                {row.orderNo}
              </td>
              <td className="px-3 text-zinc-700">{row.customerName}</td>
              <td className="px-3 text-right font-mono tabular-nums text-zinc-700">
                {formatNumber(Number(row.orderQty))}
              </td>
              <td className="px-3 text-zinc-500">
                {row.dueDate ? formatDate(row.dueDate, "dd/MM/yyyy") : "—"}
              </td>
              <td className="px-3">
                <StatusBadge
                  status={statusToBadge(row.status)}
                  size="sm"
                  label={SALES_ORDER_STATUS_LABELS[row.status]}
                />
              </td>
              <td className="px-1">
                <Link
                  href={`/orders/${row.orderNo}`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600"
                  title="Mở chi tiết đơn"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
