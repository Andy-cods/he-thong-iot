"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, FileText, Package } from "lucide-react";
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

/**
 * V1.8 batch 4 — Procurement panel cho BOM workspace.
 * Fetch PR + PO filter bomTemplateId (JOIN qua sales_order.bom_template_id).
 * Chia 2 section compact, row 32px. Empty state riêng từng section.
 */
export function ProcurementPanel({ bomId }: { bomId: string }) {
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
  const isLoading = prQuery.isLoading || poQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-1 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  const isEmpty = prRows.length === 0 && poRows.length === 0;

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-xs text-zinc-500">
        <Package className="h-5 w-5 text-zinc-300" aria-hidden />
        <span>Chưa có yêu cầu mua hoặc đơn đặt hàng gắn với BOM này.</span>
        <div className="flex items-center gap-3">
          <Link
            href={`/procurement/purchase-requests?bomTemplateId=${bomId}`}
            className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
          >
            Xem PR toàn cục <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
          <Link
            href={`/procurement/purchase-orders?bomTemplateId=${bomId}`}
            className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
          >
            Xem PO toàn cục <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col divide-y divide-zinc-200 overflow-hidden">
      {/* PR section */}
      <section className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-600">
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3 w-3" aria-hidden />
            Yêu cầu mua (PR) · {prRows.length}
          </span>
          <Link
            href={`/procurement/purchase-requests?bomTemplateId=${bomId}`}
            className="text-[10px] font-normal normal-case text-indigo-600 hover:underline"
          >
            Xem tất cả
          </Link>
        </header>
        <div className="flex-1 overflow-auto">
          {prRows.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4 text-xs text-zinc-400">
              Chưa có PR cho BOM này.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-[5] bg-white">
                <tr className="border-b border-zinc-100 text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-1 text-left font-medium">Mã PR</th>
                  <th className="px-3 py-1 text-left font-medium">Tiêu đề</th>
                  <th className="px-3 py-1 text-left font-medium">Nguồn</th>
                  <th className="px-3 py-1 text-left font-medium">Trạng thái</th>
                  <th className="px-3 py-1 text-left font-medium">Tạo</th>
                  <th className="px-3 py-1 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {prRows.map((row) => (
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
          )}
        </div>
      </section>

      {/* PO section */}
      <section className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-600">
          <span className="inline-flex items-center gap-1.5">
            <Package className="h-3 w-3" aria-hidden />
            Đơn đặt hàng (PO) · {poRows.length}
          </span>
          <Link
            href={`/procurement/purchase-orders?bomTemplateId=${bomId}`}
            className="text-[10px] font-normal normal-case text-indigo-600 hover:underline"
          >
            Xem tất cả
          </Link>
        </header>
        <div className="flex-1 overflow-auto">
          {poRows.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4 text-xs text-zinc-400">
              Chưa có PO cho BOM này.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-[5] bg-white">
                <tr className="border-b border-zinc-100 text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-1 text-left font-medium">Mã PO</th>
                  <th className="px-3 py-1 text-left font-medium">NCC</th>
                  <th className="px-3 py-1 text-left font-medium">Trạng thái</th>
                  <th className="px-3 py-1 text-left font-medium">ETA</th>
                  <th className="px-3 py-1 text-right font-medium">Giá trị</th>
                  <th className="px-3 py-1 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {poRows.map((row) => (
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
          )}
        </div>
      </section>
    </div>
  );
}
