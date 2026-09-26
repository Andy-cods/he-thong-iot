"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import {
  can,
  type SalesOrderStatus,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-badge";
import { QueryError } from "@/components/ui/query-error";
import { useOrdersList } from "@/hooks/useOrders";
import { formatDate, formatNumber } from "@/lib/format";
import { CreateOrderDialog } from "../CreateOrderDialog";
import { useSession } from "@/hooks/useSession";

/* ── Status badge ─────────────────────────────────────────────────────────── */
// V4.1 UI-07: bỏ ORDER_STATUS_STYLE cục bộ ("Huỷ" đỏ, "Đã snapshot") — nhãn + tông
// lấy từ lib/status.ts domain "salesOrder".
function OrderStatusBadge({ status }: { status: SalesOrderStatus }) {
  return <StatusPill domain="salesOrder" code={status} dot />;
}

/* ── Component ────────────────────────────────────────────────────────────── */
export interface OrdersPanelProps {
  bomId: string;
  bomCode?: string;
}

export function OrdersPanel({ bomId, bomCode }: OrdersPanelProps) {
  const session = useSession();
  const query = useOrdersList({ bomTemplateId: bomId, page: 1, pageSize: 50 });
  const rows = query.data?.data ?? [];
  const [createOpen, setCreateOpen] = React.useState(false);
  const canCreateOrder = can(
    session.data?.roles ?? [],
    "create",
    "salesOrder",
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {query.isLoading ? "Đang tải…" : query.isError && rows.length === 0 ? "—" : (
            <><span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">{rows.length}</span> đơn hàng dùng BOM này</>
          )}
        </p>
        {canCreateOrder && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Tạo đơn từ BOM này
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : query.isError && rows.length === 0 ? (
          // V4.1 UI-05: lỗi API không được hiện "Chưa có đơn hàng nào".
          <QueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Không tải được đơn hàng"
          />
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
              <Plus className="h-5 w-5 text-zinc-400 dark:text-zinc-500" aria-hidden />
            </div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Chưa có đơn hàng nào</p>
            <p className="max-w-xs text-xs text-zinc-500 dark:text-zinc-400">
              {canCreateOrder
                ? "Dùng nút “Tạo đơn từ BOM này” để tạo đơn hàng liên kết với BOM."
                : "Bạn có quyền xem nhưng không có quyền tạo đơn hàng."}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr className="border-b-2 border-zinc-100 dark:border-zinc-800">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Mã đơn</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Khách hàng</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">SL</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Ngày giao</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Trạng thái</th>
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="group border-b border-zinc-50 transition-colors hover:bg-zinc-50/70 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40">
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">{row.orderNo}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-zinc-800 dark:text-zinc-200">{row.customerName}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="font-mono text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatNumber(Number(row.orderQty))}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {row.dueDate ? formatDate(row.dueDate, "dd/MM/yyyy") : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <OrderStatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-3.5">
                    <Link
                      href={`/orders/${row.orderNo}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 opacity-0 transition-all hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100 dark:text-zinc-500 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400"
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

      {canCreateOrder && (
        <CreateOrderDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          bomTemplateId={bomId}
          bomTemplateCode={bomCode ?? ""}
        />
      )}
    </div>
  );
}
