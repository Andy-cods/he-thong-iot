"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PO_STATUS_LABELS, type POStatus } from "@iot/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PORow } from "@/hooks/usePurchaseOrders";

export interface POListTableProps {
  rows: PORow[];
  loading?: boolean;
}

const PO_STATUS_PILL: Record<POStatus, { cls: string; dot: string }> = {
  DRAFT:     { cls: "bg-zinc-100 text-zinc-700 ring-zinc-200",      dot: "bg-zinc-400"   },
  SENT:      { cls: "bg-blue-50 text-blue-700 ring-blue-200",       dot: "bg-blue-500"   },
  PARTIAL:   { cls: "bg-amber-50 text-amber-700 ring-amber-200",    dot: "bg-amber-500 animate-pulse" },
  RECEIVED:  { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  CANCELLED: { cls: "bg-red-50 text-red-700 ring-red-200",          dot: "bg-red-400"    },
  CLOSED:    { cls: "bg-zinc-100 text-zinc-500 ring-zinc-200",      dot: "bg-zinc-400"   },
};

const APPROVAL_PILL: Record<string, { label: string; cls: string }> = {
  pending:  { label: "Chờ duyệt",   cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  approved: { label: "Đã duyệt",    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  rejected: { label: "Từ chối",     cls: "bg-red-50 text-red-700 ring-red-200" },
};

function fmtVND(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "0";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "0";
  return Math.round(num).toLocaleString("vi-VN");
}

export function POListTable({ rows, loading }: POListTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // tăng từ 40 → 56 cho không gian thoáng
    overscan: 8,
  });

  const gridCols =
    "grid-cols-[150px_minmax(0,1fr)_140px_120px_120px_140px_120px_60px]";

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm"
      role="region"
      aria-label="Danh sách PO"
    >
      {/* Header */}
      <div
        className={cn(
          "sticky top-0 z-sticky grid h-12 items-center border-b border-zinc-200 bg-white px-5 text-xs font-semibold uppercase tracking-wider text-zinc-400",
          gridCols,
        )}
      >
        <div>Số PO</div>
        <div>Nhà cung cấp</div>
        <div className="text-right">Tổng (VND)</div>
        <div>Duyệt</div>
        <div>Ngày giao</div>
        <div>Trạng thái</div>
        <div>Ngày tạo</div>
        <div />
      </div>

      {/* Loading skeleton */}
      {loading && rows.length === 0 && (
        <div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "grid h-14 items-center border-b border-zinc-50 px-5",
                gridCols,
              )}
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
            </div>
          ))}
        </div>
      )}

      {/* Rows */}
      <div
        style={{ height: `${virt.getTotalSize()}px` }}
        className={cn("relative w-full", loading && rows.length === 0 && "hidden")}
      >
        {virt.getVirtualItems().map((v) => {
          const row = rows[v.index];
          if (!row) return null;
          const statusCfg = PO_STATUS_PILL[row.status];
          const approval = row.metadata?.approvalStatus;
          const approvalCfg = approval ? APPROVAL_PILL[approval] : null;

          return (
            <Link
              key={row.id}
              href={`/procurement/purchase-orders/${row.id}`}
              style={{
                transform: `translateY(${v.start}px)`,
                height: `${v.size}px`,
              }}
              className={cn(
                "group absolute left-0 top-0 grid w-full items-center border-b border-zinc-50 px-5 transition-colors hover:bg-indigo-50/30",
                gridCols,
              )}
            >
              <span className="font-mono text-sm font-bold text-indigo-600 group-hover:underline truncate" title={row.poNo}>
                {row.poNo}
              </span>
              <span className="truncate pr-3 text-sm text-zinc-800">
                {row.supplierName ?? row.supplierCode ?? `${row.supplierId.slice(0, 8)}…`}
              </span>
              <span className="text-right font-mono text-sm font-semibold tabular-nums text-zinc-900">
                {fmtVND(row.totalAmount)}
              </span>
              <span>
                {approvalCfg ? (
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                    approvalCfg.cls,
                  )}>
                    {approvalCfg.label}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-400">—</span>
                )}
              </span>
              <span className="text-sm text-zinc-600 tabular-nums">
                {row.expectedEta ? formatDate(row.expectedEta, "dd/MM/yyyy") : "—"}
              </span>
              <span className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset w-fit",
                statusCfg.cls,
              )}>
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusCfg.dot)} aria-hidden />
                {PO_STATUS_LABELS[row.status]}
              </span>
              <span className="text-sm text-zinc-600 tabular-nums">
                {formatDate(row.createdAt, "dd/MM/yyyy")}
              </span>
              <ArrowUpRight className="h-4 w-4 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
