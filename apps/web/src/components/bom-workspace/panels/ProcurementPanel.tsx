"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Package } from "lucide-react";
import {
  PR_STATUS_LABELS,
  PO_STATUS_LABELS,
  type PRStatus,
  type POStatus,
} from "@iot/shared";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";
import { usePurchaseRequestsList } from "@/hooks/usePurchaseRequests";
import { usePurchaseOrdersList } from "@/hooks/usePurchaseOrders";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function prStatusToBadge(s: PRStatus): BadgeStatus {
  switch (s) {
    case "DRAFT":
      return "draft";
    case "SUBMITTED":
      return "info";
    case "APPROVED":
      return "warning";
    case "CONVERTED":
      return "success";
    case "REJECTED":
      return "danger";
    default:
      return "info";
  }
}

function poStatusToBadge(s: POStatus): BadgeStatus {
  switch (s) {
    case "DRAFT":
      return "draft";
    case "SENT":
      return "info";
    case "PARTIAL":
      return "warning";
    case "RECEIVED":
    case "CLOSED":
      return "success";
    case "CANCELLED":
      return "danger";
    default:
      return "info";
  }
}

type SubTab = "pr" | "po";

export function ProcurementPanel({
  bomId,
}: {
  bomId: string;
  /** Reserved for future use (vd suggest title); chưa dùng. */
  bomCode?: string;
}) {
  const [subTab, setSubTab] = React.useState<SubTab>("pr");

  const prQuery = usePurchaseRequestsList({
    bomTemplateId: bomId,
    page: 1,
    pageSize: 30,
  });
  const poQuery = usePurchaseOrdersList({
    bomTemplateId: bomId,
    page: 1,
    pageSize: 30,
  });

  const prRows = prQuery.data?.data ?? [];
  const poRows = poQuery.data?.data ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Inline toolbar — sub-tabs + create */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-3 py-2">
        <div
          role="tablist"
          aria-label="PR/PO sub-tabs"
          className="inline-flex items-center rounded-md border border-zinc-200 bg-white p-0.5"
        >
          {(["pr", "po"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={subTab === k}
              onClick={() => setSubTab(k)}
              className={cn(
                "inline-flex h-6 items-center rounded-sm px-2.5 text-[11px] font-medium transition-colors",
                subTab === k
                  ? "bg-indigo-50 text-indigo-700 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900",
              )}
            >
              {k === "pr"
                ? `PR · ${prQuery.isLoading ? "…" : prRows.length}`
                : `PO · ${poQuery.isLoading ? "…" : poRows.length}`}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3 text-[11px] text-zinc-500">
          {subTab === "pr" ? (
            <span>
              Tạo PR mới: dùng nút <em className="font-normal">Đặt mua nhanh</em>{" "}
              trên dòng grid hoặc tab{" "}
              <em className="font-normal">Thiếu vật tư</em> để bulk PR.
            </span>
          ) : (
            <Link
              href={`/procurement/purchase-orders?bomTemplateId=${bomId}`}
              className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
            >
              Xem toàn cục <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {subTab === "pr" ? (
          <PRTable rows={prRows} loading={prQuery.isLoading} />
        ) : (
          <POTable rows={poRows} loading={poQuery.isLoading} />
        )}
      </div>
    </div>
  );

  function PRTable({
    rows,
    loading,
  }: {
    rows: typeof prRows;
    loading: boolean;
  }) {
    if (loading) {
      return (
        <div className="space-y-1 p-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-xs text-zinc-500">
          <Package className="h-5 w-5 text-zinc-300" aria-hidden />
          <span>Chưa có Purchase Request gắn với BOM này.</span>
        </div>
      );
    }
    return (
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm">
          <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-1.5 text-left font-medium">Mã PR</th>
            <th className="px-3 py-1.5 text-left font-medium">Tiêu đề</th>
            <th className="px-3 py-1.5 text-left font-medium">Nguồn</th>
            <th className="px-3 py-1.5 text-left font-medium">Trạng thái</th>
            <th className="px-3 py-1.5 text-left font-medium">Tạo</th>
            <th className="px-3 py-1.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row.id} className="h-8 hover:bg-zinc-50">
              <td className="px-3 font-mono text-[11px] font-semibold text-indigo-600">
                {row.code}
              </td>
              <td className="px-3 text-zinc-700">
                {row.title ?? <span className="text-zinc-400">—</span>}
              </td>
              <td className="px-3 text-[10px] uppercase tracking-wide text-zinc-500">
                {row.source}
              </td>
              <td className="px-3">
                <StatusBadge
                  status={prStatusToBadge(row.status)}
                  size="sm"
                  label={PR_STATUS_LABELS[row.status]}
                />
              </td>
              <td className="px-3 text-zinc-500">
                {formatDate(row.createdAt, "dd/MM/yyyy")}
              </td>
              <td className="px-1">
                <Link
                  href={`/procurement/purchase-requests/${row.id}`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600"
                  title="Mở chi tiết PR"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function POTable({
    rows,
    loading,
  }: {
    rows: typeof poRows;
    loading: boolean;
  }) {
    if (loading) {
      return (
        <div className="space-y-1 p-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-xs text-zinc-500">
          <Package className="h-5 w-5 text-zinc-300" aria-hidden />
          <span>Chưa có Purchase Order gắn với BOM này.</span>
          <span className="text-[10px] text-zinc-400">
            PO thường được sinh từ PR đã APPROVED → CONVERT.
          </span>
        </div>
      );
    }
    return (
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm">
          <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-1.5 text-left font-medium">Mã PO</th>
            <th className="px-3 py-1.5 text-left font-medium">NCC</th>
            <th className="px-3 py-1.5 text-left font-medium">Trạng thái</th>
            <th className="px-3 py-1.5 text-left font-medium">ETA</th>
            <th className="px-3 py-1.5 text-right font-medium">Giá trị</th>
            <th className="px-3 py-1.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row.id} className="h-8 hover:bg-zinc-50">
              <td className="px-3 font-mono text-[11px] font-semibold text-indigo-600">
                {row.poNo}
              </td>
              <td className="px-3 text-zinc-700">
                {row.supplierName ?? (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
              <td className="px-3">
                <StatusBadge
                  status={poStatusToBadge(row.status)}
                  size="sm"
                  label={PO_STATUS_LABELS[row.status]}
                />
              </td>
              <td className="px-3 text-zinc-500">
                {row.expectedEta
                  ? formatDate(row.expectedEta, "dd/MM/yyyy")
                  : "—"}
              </td>
              <td className="px-3 text-right font-mono tabular-nums text-zinc-700">
                {Number(row.totalAmount ?? 0).toLocaleString("vi-VN")}{" "}
                <span className="text-[10px] text-zinc-400">
                  {row.currency}
                </span>
              </td>
              <td className="px-1">
                <Link
                  href={`/procurement/purchase-orders/${row.id}`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600"
                  title="Mở chi tiết PO"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
}

