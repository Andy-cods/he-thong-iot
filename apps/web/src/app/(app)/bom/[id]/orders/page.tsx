"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ClipboardList, ExternalLink, Plus } from "lucide-react";
import {
  SALES_ORDER_STATUS_LABELS,
  type SalesOrderStatus,
} from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";
import { useBomDetail } from "@/hooks/useBom";
import { useOrdersList } from "@/hooks/useOrders";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function statusToBadge(status: SalesOrderStatus): {
  badgeStatus: BadgeStatus;
  label: string;
} {
  const label = SALES_ORDER_STATUS_LABELS[status];
  switch (status) {
    case "DRAFT":
      return { badgeStatus: "draft", label };
    case "CONFIRMED":
      return { badgeStatus: "info", label };
    case "SNAPSHOTTED":
    case "IN_PROGRESS":
      return { badgeStatus: "warning", label };
    case "FULFILLED":
      return { badgeStatus: "success", label };
    case "CLOSED":
      return { badgeStatus: "inactive", label };
    case "CANCELLED":
      return { badgeStatus: "danger", label };
    default:
      return { badgeStatus: "info", label };
  }
}

export default function BomWorkspaceOrdersPage() {
  const params = useParams<{ id: string }>();
  const bomId = params?.id ?? "";
  const detail = useBomDetail(bomId);
  const template = detail.data?.data?.template;

  const orders = useOrdersList({
    bomTemplateId: bomId,
    page: 1,
    pageSize: 50,
  });
  const rows = orders.data?.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-3">
        <Breadcrumb
          items={[
            { label: "BOM", href: "/bom" },
            { label: template?.code ?? "…", href: `/bom/${bomId}` },
            { label: "Đơn hàng" },
          ]}
        />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
              <ClipboardList
                className="h-5 w-5 text-indigo-500"
                aria-hidden="true"
              />
              Đơn hàng dùng BOM này
              {orders.data?.meta ? (
                <span className="ml-1 text-sm font-normal text-zinc-500">
                  ({formatNumber(orders.data.meta.total)})
                </span>
              ) : null}
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Danh sách Sales Orders tham chiếu đến{" "}
              <span className="font-mono text-zinc-700">
                {template?.code ?? "…"}
              </span>
              .
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link href={`/orders/new?bomTemplateId=${bomId}`}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Tạo đơn hàng
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/orders?bomTemplateId=${bomId}`}>
                Toàn cục
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {orders.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : orders.isError ? (
          <EmptyState
            preset="error"
            title="Không tải được danh sách đơn hàng"
            description={(orders.error as Error)?.message ?? "Lỗi không xác định"}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            preset="no-data"
            title="Chưa có đơn hàng cho BOM này"
            description="Tạo đơn hàng đầu tiên để kích hoạt snapshot BOM và pipeline sản xuất."
            actions={
              <Button asChild size="sm">
                <Link href={`/orders/new?bomTemplateId=${bomId}`}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Tạo đơn hàng mới
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2 text-left font-medium">Mã đơn</th>
                  <th className="px-3 py-2 text-left font-medium">Khách hàng</th>
                  <th className="px-3 py-2 text-right font-medium">SL</th>
                  <th className="px-3 py-2 text-left font-medium">Due</th>
                  <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => {
                  const badge = statusToBadge(row.status);
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "h-9 transition-colors hover:bg-zinc-50",
                      )}
                    >
                      <td className="px-3">
                        <Link
                          href={`/orders/${row.orderNo}`}
                          className="font-mono text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          {row.orderNo}
                        </Link>
                      </td>
                      <td className="px-3 text-zinc-700">{row.customerName}</td>
                      <td className="px-3 text-right font-mono text-xs tabular-nums text-zinc-700">
                        {formatNumber(Number(row.orderQty))}
                      </td>
                      <td className="px-3 text-xs text-zinc-500">
                        {row.dueDate
                          ? formatDate(row.dueDate, "dd/MM/yyyy")
                          : "—"}
                      </td>
                      <td className="px-3">
                        <StatusBadge
                          status={badge.badgeStatus}
                          size="sm"
                          label={badge.label}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
