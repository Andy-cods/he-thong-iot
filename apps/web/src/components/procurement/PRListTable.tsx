"use client";

import * as React from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PR_STATUS_LABELS, type PRStatus } from "@iot/shared";
import { StatusBadge, type BadgeStatus } from "@/components/domain/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PRRow } from "@/hooks/usePurchaseRequests";

export interface PRListTableProps {
  rows: PRRow[];
  loading?: boolean;
}

function statusToBadge(s: PRStatus): { v: BadgeStatus; label: string } {
  const label = PR_STATUS_LABELS[s];
  switch (s) {
    case "DRAFT":
      return { v: "draft", label };
    case "SUBMITTED":
      return { v: "info", label };
    case "APPROVED":
      return { v: "success", label };
    case "CONVERTED":
      return { v: "info", label };
    case "REJECTED":
      return { v: "danger", label };
  }
}

/**
 * V2 PRListTable — compact row 36px, virtualize khi >50 rows.
 * Cols: [Mã 128 mono] [Tiêu đề 1fr] [Nguồn 88] [Trạng thái 112]
 *       [Ngày tạo 104]
 */
export function PRListTable({ rows, loading }: PRListTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
  });

  const gridCols =
    "grid-cols-[128px_minmax(0,1fr)_88px_112px_104px]";

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded-md border border-zinc-200 bg-white"
      role="region"
      aria-label="Danh sách PR"
    >
      <div
        className={cn(
          "sticky top-0 z-sticky grid h-8 items-center border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wide text-zinc-500",
          gridCols,
        )}
      >
        <div>Mã PR</div>
        <div>Tiêu đề</div>
        <div>Nguồn</div>
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
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-4 w-12 rounded-sm" />
              <Skeleton className="h-4 w-16 rounded-sm" />
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
              role="row"
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
                href={`/procurement/purchase-requests/${row.id}`}
                className="truncate font-mono text-sm text-zinc-700 hover:text-blue-600"
                title={row.code}
              >
                {row.code}
              </Link>
              <div className="truncate pr-2" title={row.title ?? ""}>
                {row.title ?? <span className="text-zinc-400">—</span>}
              </div>
              <div className="text-xs text-zinc-600">
                {row.source === "SHORTAGE" ? "Shortage" : "Thủ công"}
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
