"use client";

import * as React from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, Eye, Pencil, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { BOM_STATUS_LABELS, type BomStatus } from "@iot/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge, type BadgeStatus } from "@/components/domain/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isSelected,
  pageSelectState,
  type Selection,
} from "@/hooks/use-selection";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/format";

export interface BomRow {
  id: string;
  code: string;
  name: string;
  parentItemSku: string | null;
  parentItemName: string | null;
  targetQty: string;
  status: BomStatus;
  componentCount: number;
  updatedAt: string | Date;
}

export interface BomListTableProps {
  rows: BomRow[];
  loading?: boolean;
  selection: Selection;
  onToggleRow: (id: string) => void;
  onTogglePage: (visibleIds: string[]) => void;
  onEdit: (row: BomRow) => void;
  onPreview?: (row: BomRow) => void;
  onClone?: (row: BomRow) => void;
  focusedIndex?: number;
}

function bomStatusToBadge(status: BomStatus): {
  badgeStatus: BadgeStatus;
  label: string;
} {
  switch (status) {
    case "ACTIVE":
      return { badgeStatus: "success", label: BOM_STATUS_LABELS.ACTIVE };
    case "DRAFT":
      return { badgeStatus: "draft", label: BOM_STATUS_LABELS.DRAFT };
    case "OBSOLETE":
      return { badgeStatus: "inactive", label: BOM_STATUS_LABELS.OBSOLETE };
  }
}

/**
 * V2 BomListTable — compact row 36px theo pattern ItemListTable.
 *
 * Columns: [checkbox 32][Code sticky 128 mono][Tên 1fr][Parent SKU 128 mono]
 *          [#Lines 72 right][Target 80 right][Status 96][Updated 96][Actions 112].
 */
export function BomListTable({
  rows,
  loading,
  selection,
  onToggleRow,
  onTogglePage,
  onEdit,
  onPreview,
  onClone,
  focusedIndex,
}: BomListTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowHeight = 36;

  const visibleIds = React.useMemo(() => rows.map((r) => r.id), [rows]);
  const pageState = pageSelectState(selection, visibleIds);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  React.useEffect(() => {
    if (focusedIndex !== undefined && focusedIndex >= 0) {
      virt.scrollToIndex(focusedIndex, { align: "auto" });
    }
  }, [focusedIndex, virt]);

  const copyCode = React.useCallback((code: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(code);
      toast.success(`Đã copy ${code}`);
    }
  }, []);

  const gridCols =
    "grid-cols-[32px_128px_minmax(0,1fr)_128px_72px_80px_96px_96px_112px]";

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded-md border border-zinc-200 bg-white"
      role="region"
      aria-label="Danh sách BOM templates"
    >
      {/* Header */}
      <div
        className={cn(
          "sticky top-0 z-sticky grid h-8 items-center border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wide text-zinc-500",
          gridCols,
        )}
        role="row"
      >
        <div className="flex items-center justify-center">
          <Checkbox
            aria-label="Chọn tất cả trong trang"
            checked={
              pageState === "indeterminate"
                ? "indeterminate"
                : pageState === "checked"
            }
            onCheckedChange={() => onTogglePage(visibleIds)}
          />
        </div>
        <div role="columnheader">Mã BOM</div>
        <div role="columnheader">Tên</div>
        <div role="columnheader">Parent item</div>
        <div role="columnheader" className="text-right">
          Linh kiện
        </div>
        <div role="columnheader" className="text-right">
          Target Qty
        </div>
        <div role="columnheader">Trạng thái</div>
        <div role="columnheader">Cập nhật</div>
        <div role="columnheader" className="text-center">
          Thao tác
        </div>
      </div>

      {loading && rows.length === 0 && (
        <div>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "grid items-center border-b border-zinc-100 px-3",
                gridCols,
              )}
              style={{ height: rowHeight }}
            >
              <Skeleton className="h-3.5 w-3.5" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-16 rounded-sm" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}

      <div
        style={{ height: `${virt.getTotalSize()}px` }}
        className={cn(
          "relative w-full",
          loading && rows.length === 0 && "hidden",
        )}
      >
        {virt.getVirtualItems().map((v) => {
          const row = rows[v.index];
          if (!row) return null;
          const checked = isSelected(selection, row.id);
          const isFocused = focusedIndex === v.index;
          const badge = bomStatusToBadge(row.status);
          return (
            <div
              key={row.id}
              role="row"
              aria-selected={checked}
              style={{
                transform: `translateY(${v.start}px)`,
                height: `${v.size}px`,
              }}
              className={cn(
                "absolute left-0 top-0 grid w-full items-center border-b border-zinc-100 px-3 text-base text-zinc-900 transition-colors duration-100",
                "hover:bg-zinc-50",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:-outline-offset-2",
                checked && "bg-blue-50",
                isFocused &&
                  "bg-zinc-50 outline outline-2 -outline-offset-2 outline-blue-500",
                gridCols,
              )}
              tabIndex={-1}
            >
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggleRow(row.id)}
                  aria-label={`Chọn BOM ${row.code}`}
                />
              </div>

              <Link
                href={`/bom/${row.id}`}
                className={cn(
                  "sticky left-0 truncate border-r border-zinc-100 bg-white pr-2 font-mono text-sm text-zinc-700 hover:text-blue-600",
                  checked && "bg-blue-50",
                  isFocused && !checked && "bg-zinc-50",
                )}
                title={row.code}
              >
                {row.code}
              </Link>

              <Link
                href={`/bom/${row.id}`}
                className="truncate pr-2 text-zinc-900 hover:text-blue-600 focus-visible:outline-none focus-visible:text-blue-600"
                title={row.name}
              >
                {row.name}
              </Link>

              <div
                className="truncate font-mono text-sm text-zinc-600"
                title={
                  row.parentItemSku
                    ? `${row.parentItemSku} — ${row.parentItemName ?? ""}`
                    : ""
                }
              >
                {row.parentItemSku ?? "—"}
              </div>

              <div className="text-right tabular-nums text-zinc-700">
                {formatNumber(row.componentCount)}
              </div>

              <div className="text-right tabular-nums text-zinc-700">
                {formatNumber(Number(row.targetQty))}
              </div>

              <div>
                <StatusBadge
                  status={badge.badgeStatus}
                  size="sm"
                  label={badge.label}
                />
              </div>

              <div className="truncate text-xs text-zinc-500">
                {formatDate(row.updatedAt, "dd/MM/yyyy HH:mm")}
              </div>

              <div className="flex items-center justify-center gap-0.5">
                {onPreview && (
                  <button
                    type="button"
                    onClick={() => onPreview(row)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                    aria-label={`Xem ${row.code}`}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  aria-label={`Sửa ${row.code}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => copyCode(row.code)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  aria-label={`Copy mã ${row.code}`}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {onClone && (
                  <button
                    type="button"
                    onClick={() => onClone(row)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                    aria-label={`Clone ${row.code}`}
                  >
                    <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
