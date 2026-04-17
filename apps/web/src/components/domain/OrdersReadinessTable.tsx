"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, type BadgeStatus } from "@/components/domain/StatusBadge";
import { formatDate, formatDaysLeft } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Direction B — OrdersReadinessTable (design-spec §3.14).
 *
 * Compact table dùng trên Dashboard. Dữ liệu V1 là mock; khi Order module
 * ready V1.1 sẽ thay bằng query `/api/dashboard/overview`.
 *
 * Cột: PO · Customer · Ready% (progress bar) · Due (days left) · Status badge.
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
          "rounded-md border border-slate-200 bg-white p-4",
          className,
        )}
      >
        <Skeleton className="mb-3 h-5 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-10 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-slate-200 bg-white p-8 text-center",
          className,
        )}
      >
        <p className="text-sm text-slate-500">Chưa có đơn hàng nào.</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-slate-200 bg-white",
        className,
      )}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">
          Đơn hàng sắp giao, sắp xếp theo deadline.
        </caption>
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <th scope="col" className="px-3 py-2">PO</th>
            <th scope="col" className="px-3 py-2">Khách hàng</th>
            <th scope="col" className="px-3 py-2">Sản phẩm</th>
            <th scope="col" className="px-3 py-2">Deadline</th>
            <th scope="col" className="px-3 py-2">Ready</th>
            <th scope="col" className="px-3 py-2 text-right">Thiếu</th>
            <th scope="col" className="px-3 py-2">Trạng thái</th>
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

  return (
    <tr
      className={cn(
        "h-10 border-b border-slate-100 last:border-b-0 odd:bg-slate-50/50",
        isClickable &&
          "cursor-pointer transition-colors hover:bg-slate-100 focus-within:bg-slate-100",
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
      <td className="px-3 py-2 font-mono text-xs font-medium text-slate-900">
        {order.orderCode}
      </td>
      <td className="px-3 py-2 text-slate-700">{order.customerName}</td>
      <td className="px-3 py-2 text-slate-600">{order.productName}</td>
      <td className="px-3 py-2 text-slate-700">
        <span className="mr-1 tabular-nums">
          {formatDate(order.deadline, "dd/MM")}
        </span>
        <span
          className={cn(
            "text-xs",
            daysLeft.overdue ? "text-danger-strong" : "text-slate-500",
          )}
        >
          ({daysLeft.label})
        </span>
      </td>
      <td className="px-3 py-2">
        <ReadinessBar percent={order.readinessPercent} />
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
        {order.shortageSkus > 0 ? `${order.shortageSkus} SKU` : "—"}
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={order.status} size="sm" />
      </td>
    </tr>
  );
}

function ReadinessBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillColor =
    clamped >= 80
      ? "bg-success"
      : clamped >= 40
        ? "bg-warning"
        : "bg-danger";

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 shrink-0 rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Sẵn sàng ${clamped}%`}
      >
        <div
          className={cn("h-full rounded-full transition-all", fillColor)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-slate-700">
        {clamped}%
      </span>
    </div>
  );
}

/**
 * Mock generator V1 — dùng khi chưa có Order module thật.
 * @internal TODO V1.1: replace với `/api/dashboard/overview`.
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
