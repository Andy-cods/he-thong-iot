"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { StatusBadge, type BadgeStatus } from "@/components/domain/StatusBadge";
import { formatDate, formatDaysLeft } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * V2 OrdersReadinessTable — Linear-inspired compact (design-spec §3.3.2).
 *
 * Delta V1: row h-10→h-9 (36px), no zebra, padding-x 3→3 (12px), text-base 13px.
 * Cột: PO (mono 12) · Khách hàng · Sản phẩm · Deadline · Ready% (progress h-1.5) · Thiếu · Trạng thái sm.
 *
 * V1 mock dữ liệu giữ nguyên; V1.1 sẽ thay bằng `/api/dashboard/overview`.
 */

export interface OrderReadinessRow {
  id: string;
  orderCode: string;
  customerName: string;
  productName: string;
  deadline: string | Date;
  readinessPercent: number;
  shortageSkus: number;
  status: BadgeStatus;
}

export interface OrdersReadinessTableProps {
  orders: OrderReadinessRow[];
  loading?: boolean;
  onRowClick?: (order: OrderReadinessRow) => void;
  limit?: number;
  className?: string;
}

export function OrdersReadinessTable({
  orders,
  loading,
  onRowClick,
  limit = 10,
  className,
}: OrdersReadinessTableProps) {
  const rows = React.useMemo(
    () => orders.slice(0, limit),
    [orders, limit],
  );

  if (loading) {
    return (
      <div
        aria-busy="true"
        className={cn(
          "rounded-md border border-zinc-200 bg-white p-4",
          className,
        )}
      >
        <Skeleton className="mb-3 h-4 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="mb-1.5 h-9 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-zinc-200 bg-white p-8 text-center",
          className,
        )}
      >
        <p className="text-sm text-zinc-500">Chưa có đơn hàng nào.</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-zinc-200 bg-white",
        className,
      )}
    >
      <table className="w-full text-base">
        <caption className="sr-only">
          Đơn hàng sắp giao, sắp xếp theo deadline.
        </caption>
        <thead className="border-b border-zinc-200">
          <tr className="text-left text-sm font-medium uppercase tracking-wide text-zinc-500">
            <th scope="col" className="h-9 px-3">PO</th>
            <th scope="col" className="h-9 px-3">Khách hàng</th>
            <th scope="col" className="h-9 px-3">Sản phẩm</th>
            <th scope="col" className="h-9 px-3">Deadline</th>
            <th scope="col" className="h-9 px-3">Ready</th>
            <th scope="col" className="h-9 px-3 text-right">Thiếu</th>
            <th scope="col" className="h-9 px-3">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((order) => (
            <OrdersRow
              key={order.id}
              order={order}
              onClick={onRowClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersRow({
  order,
  onClick,
}: {
  order: OrderReadinessRow;
  onClick?: (o: OrderReadinessRow) => void;
}) {
  const daysLeft = formatDaysLeft(order.deadline);
  const isClickable = Boolean(onClick);
  const isShortage = order.status === "shortage" || order.status === "critical";

  return (
    <tr
      className={cn(
        "h-9 border-b border-zinc-100 last:border-b-0",
        isShortage && "bg-orange-50/60",
        isClickable &&
          "cursor-pointer transition-colors duration-100 hover:bg-zinc-50 focus-within:bg-zinc-50",
      )}
      onClick={isClickable ? () => onClick?.(order) : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.(order);
              }
            }
          : undefined
      }
    >
      <td className="px-3 font-mono text-sm font-medium text-zinc-900">
        {order.orderCode}
      </td>
      <td className="px-3 text-zinc-900">{order.customerName}</td>
      <td className="px-3 text-zinc-600">{order.productName}</td>
      <td className="px-3 text-zinc-700">
        <span className="mr-1 tabular-nums">
          {formatDate(order.deadline, "dd/MM")}
        </span>
        <span
          className={cn(
            "text-sm",
            daysLeft.overdue ? "text-red-600" : "text-zinc-500",
          )}
        >
          ({daysLeft.label})
        </span>
      </td>
      <td className="px-3">
        <ReadinessBar percent={order.readinessPercent} />
      </td>
      <td className="px-3 text-right font-mono tabular-nums text-zinc-700">
        {order.shortageSkus > 0 ? `${order.shortageSkus} SKU` : "—"}
      </td>
      <td className="px-3">
        <StatusBadge status={order.status} size="sm" />
      </td>
    </tr>
  );
}

function ReadinessBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillColor =
    clamped >= 80
      ? "bg-emerald-500"
      : clamped >= 40
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 shrink-0 rounded-full bg-zinc-200"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Sẵn sàng ${clamped}%`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-200",
            fillColor,
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="font-mono text-sm tabular-nums text-zinc-700">
        {clamped}%
      </span>
    </div>
  );
}

/**
 * Mock generator V1 — TODO V1.1: replace với `/api/dashboard/overview`.
 * @internal
 */
export function generateMockOrders(): OrderReadinessRow[] {
  const today = new Date();
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };

  return [
    {
      id: "1",
      orderCode: "SO-103",
      customerName: "Công ty CNC Sài Gòn",
      productName: "Jig-CNC-200",
      deadline: addDays(2),
      readinessPercent: 78,
      shortageSkus: 4,
      status: "partial",
    },
    {
      id: "2",
      orderCode: "SO-102",
      customerName: "Xưởng MM Biên Hoà",
      productName: "Gá-kẹp-X",
      deadline: addDays(4),
      readinessPercent: 95,
      shortageSkus: 1,
      status: "ready",
    },
    {
      id: "3",
      orderCode: "SO-101",
      customerName: "Nhôm Đức Tâm",
      productName: "Khung-Fix-A",
      deadline: addDays(7),
      readinessPercent: 40,
      shortageSkus: 9,
      status: "shortage",
    },
    {
      id: "4",
      orderCode: "SO-100",
      customerName: "Cơ khí Việt Tiến",
      productName: "Trục-trung",
      deadline: addDays(-1),
      readinessPercent: 55,
      shortageSkus: 3,
      status: "critical",
    },
    {
      id: "5",
      orderCode: "SO-099",
      customerName: "Kim Long Mould",
      productName: "Khuôn-nhựa-B",
      deadline: addDays(10),
      readinessPercent: 100,
      shortageSkus: 0,
      status: "ready",
    },
  ];
}
