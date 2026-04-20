"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink, Factory } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";
import { useBomDetail } from "@/hooks/useBom";
import { useWorkOrdersList, type WorkOrderStatus } from "@/hooks/useWorkOrders";
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

function woStatusToBadge(status: WorkOrderStatus): BadgeStatus {
  switch (status) {
    case "DRAFT":
      return "draft";
    case "QUEUED":
    case "RELEASED":
      return "info";
    case "IN_PROGRESS":
      return "warning";
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

export default function BomWorkspaceWorkOrdersPage() {
  const params = useParams<{ id: string }>();
  const bomId = params?.id ?? "";
  const detail = useBomDetail(bomId);
  const template = detail.data?.data?.template;

  const wos = useWorkOrdersList({
    bomTemplateId: bomId,
    page: 1,
    pageSize: 50,
  });
  const rows = wos.data?.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-3">
        <Breadcrumb
          items={[
            { label: "BOM", href: "/bom" },
            { label: template?.code ?? "…", href: `/bom/${bomId}` },
            { label: "Lệnh sản xuất" },
          ]}
        />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
              <Factory
                className="h-5 w-5 text-indigo-500"
                aria-hidden="true"
              />
              Lệnh sản xuất (WO)
              {wos.data?.meta ? (
                <span className="ml-1 text-sm font-normal text-zinc-500">
                  ({formatNumber(wos.data.meta.total)})
                </span>
              ) : null}
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Work Orders của đơn hàng dùng BOM{" "}
              <span className="font-mono text-zinc-700">
                {template?.code ?? "…"}
              </span>
              . JOIN qua sales_order.bom_template_id.
            </p>
          </div>

          <Button asChild size="sm" variant="outline">
            <Link href={`/work-orders?bomTemplateId=${bomId}`}>
              Toàn cục
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {wos.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : wos.isError ? (
          <EmptyState
            preset="error"
            title="Không tải được Work Orders"
            description={(wos.error as Error)?.message ?? "Lỗi không xác định"}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            preset="no-data"
            title="Chưa có WO cho BOM này"
            description="Work Orders sẽ xuất hiện khi tạo từ snapshot của đơn hàng tương ứng."
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2 text-left font-medium">Mã WO</th>
                  <th className="px-3 py-2 text-left font-medium">Đơn hàng</th>
                  <th className="px-3 py-2 text-right font-medium">KH</th>
                  <th className="px-3 py-2 text-right font-medium">Đã SX</th>
                  <th className="px-3 py-2 text-left font-medium">Due</th>
                  <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => {
                  const plannedNum = Number(row.plannedQty);
                  const goodNum = Number(row.goodQty);
                  const pct =
                    plannedNum > 0
                      ? Math.min(100, Math.round((goodNum / plannedNum) * 100))
                      : 0;
                  return (
                    <tr
                      key={row.id}
                      className={cn("h-9 hover:bg-zinc-50")}
                    >
                      <td className="px-3">
                        <Link
                          href={`/work-orders/${row.id}`}
                          className="font-mono text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          {row.woNo}
                        </Link>
                      </td>
                      <td className="px-3">
                        {row.orderNo ? (
                          <Link
                            href={`/orders/${row.orderNo}`}
                            className="font-mono text-xs text-zinc-700 hover:text-indigo-600"
                          >
                            {row.orderNo}
                          </Link>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-3 text-right font-mono text-xs tabular-nums text-zinc-700">
                        {formatNumber(plannedNum)}
                      </td>
                      <td className="px-3 text-right font-mono text-xs tabular-nums text-zinc-700">
                        {formatNumber(goodNum)}{" "}
                        <span className="text-[10px] text-zinc-400">
                          ({pct}%)
                        </span>
                      </td>
                      <td className="px-3 text-xs text-zinc-500">
                        {row.plannedEnd
                          ? formatDate(row.plannedEnd, "dd/MM/yyyy")
                          : "—"}
                      </td>
                      <td className="px-3">
                        <StatusBadge
                          status={woStatusToBadge(row.status)}
                          size="sm"
                          label={WO_STATUS_LABELS[row.status]}
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
