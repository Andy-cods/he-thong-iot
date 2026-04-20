"use client";

import * as React from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PO_STATUS_LABELS, type POStatus } from "@iot/shared";
import { StatusBadge, type BadgeStatus } from "@/components/domain/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PORow } from "@/hooks/usePurchaseOrders";

export interface POListTableProps {
  rows: PORow[];
  loading?: boolean;
}

function statusToBadge(s: POStatus): { v: BadgeStatus; label: string } {
  const label = PO_STATUS_LABELS[s];
  switch (s) {
    case "DRAFT":
      return { v: "draft", label };
    case "SENT":
      return { v: "info", label };
    case "PARTIAL":
      return { v: "pending", label };
    case "RECEIVED":
      return { v: "success", label };
    case "CANCELLED":
      return { v: "danger", label };
    case "CLOSED":
      return { v: "inactive", label };
  }
}

export function POListTable({ rows, loading }: POListTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
  });

  const gridCols = "grid-cols-[140px_minmax(0,1fr)_96px_112px_96px]";

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded-md border border-zinc-200 bg-white"
      role="region"
      aria-label="Danh sách PO"
    >
      <div
        className={cn(
          "sticky top-0 z-sticky grid h-8 items-center border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wide text-zinc-500",
          gridCols,
        )}
      >
        <div>Số PO</div>
        <div>NCC</div>
        <div>ETA</div>
        <div>Trạng thái</div>
        <div>Ngày tạo</div>
      </div>

      {loading && rows.length === 0 && (
        <div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "grid h-9 items-center border-b border-zinc-100 px-3",
                gridCols,
              )}
            >
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20 rounded-sm" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}

      <div
        style={{ height: `${virt.getTotalSize()}px` }}
        className={cn("relative w-full", loading && rows.length === 0 && "hidden")}
      >
        {virt.getVirtualItems().map((v) => {
          const row = rows[v.index];
          if (!row) return null;
          const badge = statusToBadge(row.status);
          return (
            <div
              key={row.id}
              style={{
                transform: `translateY(${v.start}px)`,
                height: `${v.size}px`,
              }}
              className={cn(
                "absolute left-0 top-0 grid w-full items-center border-b border-zinc-100 px-3 text-base text-zinc-900 transition-colors hover:bg-zinc-50",
                gridCols,
              )}
            >
              <Link
                href={`/procurement/purchase-orders/${row.id}`}
                className="truncate font-mono text-sm text-zinc-700 hover:text-blue-600"
                title={row.poNo}
              >
                {row.poNo}
              </Link>
              <div className="truncate pr-2 text-sm text-zinc-700">
                {row.supplierName ?? row.supplierCode ?? `${row.supplierId.slice(0, 8)}…`}
              </div>
              <div className="text-sm text-zinc-600 tabular-nums">
                {row.expectedEta
                  ? formatDate(row.expectedEta, "dd/MM/yyyy")
                  : "—"}
              </div>
              <div>
                <StatusBadge status={badge.v} size="sm" label={badge.label} />
              </div>
              <div className="text-sm text-zinc-600 tabular-nums">
                {formatDate(row.createdAt, "dd/MM/yyyy")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
