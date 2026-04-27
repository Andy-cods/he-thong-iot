"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import {
  SALES_ORDER_STATUS_LABELS,
  type SalesOrderStatus,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrdersList } from "@/hooks/useOrders";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CreateOrderDialog } from "../CreateOrderDialog";

/* ── Status badge ─────────────────────────────────────────────────────────── */
const ORDER_STATUS_STYLE: Record<SalesOrderStatus, { label: string; cls: string }> = {
  DRAFT:        { label: "Nháp",        cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  CONFIRMED:    { label: "Xác nhận",    cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  SNAPSHOTTED:  { label: "Đã snapshot", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  IN_PROGRESS:  { label: "Đang SX",     cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  FULFILLED:    { label: "Hoàn thành",  cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  CLOSED:       { label: "Đóng",        cls: "bg-zinc-100 text-zinc-500 ring-zinc-200" },
  CANCELLED:    { label: "Huỷ",         cls: "bg-red-50 text-red-600 ring-red-200" },
};

function OrderStatusBadge({ status }: { status: SalesOrderStatus }) {
  const s = ORDER_STATUS_STYLE[status] ?? { label: status, cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", s.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {s.label}
    </span>
  );
}

/* ── Component ────────────────────────────────────────────────────────────── */
export interface OrdersPanelProps {
  bomId: string;
  bomCode?: string;
}

export function OrdersPanel({ bomId, bomCode }: OrdersPanelProps) {
  const query = useOrdersList({ bomTemplateId: bomId, page: 1, pageSize: 50 });
  const rows = query.data?.data ?? [];
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5 py-3">
        <p className="text-sm font-medium text-zinc-700">
          {query.isLoading ? "Đang tải…" : (
            <><span className="tabular-nums font-semibold text-zinc-900">{rows.length}</span> đơn hàng dùng BOM này</>
          )}
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Tạo đơn từ BOM này
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
              <Plus className="h-5 w-5 text-zinc-400" aria-hidden />
            </div>
            <p className="text-sm font-medium text-zinc-700">Chưa có đơn hàng nào</p>
            <p className="max-w-xs text-xs text-zinc-500">
              Bấm <span className="font-medium text-zinc-700">"Tạo đơn từ BOM này"</span> để tạo đơn hàng liên kết với BOM.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b-2 border-zinc-100">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Mã đơn</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Khách hàng</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">SL</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Ngày giao</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Trạng thái</th>
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="group border-b border-zinc-50 transition-colors hover:bg-zinc-50/70">
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-sm font-bold text-indigo-600">{row.orderNo}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-zinc-800">{row.customerName}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="font-mono text-sm font-semibold tabular-nums text-zinc-700">
                      {formatNumber(Number(row.orderQty))}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-zinc-600">
                      {row.dueDate ? formatDate(row.dueDate, "dd/MM/yyyy") : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <OrderStatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-3.5">
                    <Link
                      href={`/orders/${row.orderNo}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 opacity-0 transition-all hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100"
                      title="Mở chi tiết đơn"
                    >
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        bomTemplateId={bomId}
        bomTemplateCode={bomCode ?? ""}
      />
    </div>
  );
}
