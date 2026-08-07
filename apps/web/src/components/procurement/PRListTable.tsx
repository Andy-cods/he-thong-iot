"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PR_STATUS_LABELS, type PRStatus } from "@iot/shared";
import { StatusBadge, type BadgeStatus } from "@/components/domain/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NO_LINE_LABEL } from "@/lib/pr-display-label";
import type { PRRow } from "@/hooks/usePurchaseRequests";

export interface PRListTableProps {
  rows: PRRow[];
  loading?: boolean;
  /** V3.16 — cột "Ngày tạo" sort được (bảng phẳng thay thư mục). */
  sortDir?: "asc" | "desc";
  /** Bấm header "Ngày tạo" để đổi chiều sort. Omit → header là text tĩnh. */
  onSortDateClick?: () => void;
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
 *       [Ngày tạo 104 — sort được, V3.16]
 * V3.12 (mobile) — <md collapse còn 3 cột [Mã|Tiêu đề|Trạng thái],
 * Nguồn + Ngày tạo `hidden md:block` (pattern ItemListTable).
 * V3.16 — bảng phẳng thay "thư mục ngày": header "Ngày tạo" là button đổi
 * sortDir khi có `onSortDateClick` (PRTab truyền xuống, điều khiển qua URL).
 */
export function PRListTable({
  rows,
  loading,
  sortDir,
  onSortDateClick,
}: PRListTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
  });

  const gridCols =
    "grid-cols-[96px_minmax(0,1fr)_104px] md:grid-cols-[128px_minmax(0,1fr)_88px_112px_104px]";

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      role="region"
      aria-label="Danh sách PR"
    >
      <div
        className={cn(
          "sticky top-0 z-sticky grid h-8 items-center border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400",
          gridCols,
        )}
      >
        <div>Mã PR</div>
        <div>Tiêu đề</div>
        <div className="hidden md:block">Nguồn</div>
        <div>Trạng thái</div>
        <div className="hidden md:block">
          {onSortDateClick ? (
            <button
              type="button"
              onClick={onSortDateClick}
              className="inline-flex items-center gap-1 uppercase tracking-wide text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Ngày tạo
              {sortDir === "asc" ? (
                <ArrowUp className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ArrowDown className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          ) : (
            "Ngày tạo"
          )}
        </div>
      </div>

      {loading && rows.length === 0 && (
        <div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "grid h-9 items-center border-b border-zinc-100 px-3 dark:border-zinc-800",
                gridCols,
              )}
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="hidden h-4 w-12 rounded-sm md:block" />
              <Skeleton className="h-4 w-16 rounded-sm" />
              <Skeleton className="hidden h-3 w-16 md:block" />
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
                "absolute left-0 top-0 grid w-full items-center border-b border-zinc-100 px-3 text-base text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-800/60",
                gridCols,
              )}
            >
              <Link
                href={`/procurement/purchase-requests/${row.id}`}
                className="truncate font-mono text-sm text-zinc-700 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-400"
                title={row.code}
              >
                {row.code}
              </Link>
              {/* V3.16 (mục 1) — ưu tiên nhãn vật tư tự sinh (mua CÁI GÌ):
                  form DNVT không cho nhập tiêu đề (luôn auto "DNVT {bộ phận}
                  {ngày}"), form MRF để trống cũng auto tương tự — title hầu
                  như LUÔN có giá trị nhưng là chuỗi chung chung không nói mua
                  gì, nên ưu tiên displayLabel trước; chỉ fallback về title
                  khi displayLabel rỗng thật (phiếu chưa có dòng vật tư nào). */}
              {(() => {
                const label =
                  row.displayLabel && row.displayLabel !== NO_LINE_LABEL
                    ? row.displayLabel
                    : (row.title ?? null);
                return (
                  <div className="truncate pr-2" title={label ?? ""}>
                    {label ?? (
                      <span className="text-zinc-400 dark:text-zinc-500">—</span>
                    )}
                  </div>
                );
              })()}
              <div className="hidden text-xs text-zinc-600 dark:text-zinc-400 md:block">
                {row.source === "SHORTAGE" ? "Shortage" : "Thủ công"}
              </div>
              <div>
                <StatusBadge status={badge.v} size="sm" label={badge.label} />
              </div>
              <div className="hidden text-sm text-zinc-600 tabular-nums dark:text-zinc-400 md:block">
                {formatDate(row.createdAt, "dd/MM/yyyy")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
