"use client";

import * as React from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, Eye, Pencil } from "lucide-react";
import { ITEM_TYPE_LABELS, type ItemType } from "@iot/shared";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isSelected,
  pageSelectState,
  type Selection,
} from "@/hooks/use-selection";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

export interface ItemRow {
  id: string;
  sku: string;
  name: string;
  itemType: ItemType;
  uom: string;
  status: string;
  category: string | null;
  isActive: boolean;
  primaryBarcode: string | null;
  supplierCount: number;
  onHand?: number | null;
  updatedAt: string | Date;
}

export interface ItemListTableProps {
  rows: ItemRow[];
  loading?: boolean;
  selection: Selection;
  onToggleRow: (id: string) => void;
  onTogglePage: (visibleIds: string[]) => void;
  onEdit: (row: ItemRow) => void;
  onPreview?: (row: ItemRow) => void;
  /** "compact" 40px / "comfort" 56px. */
  density?: "compact" | "comfort";
  /** Row index đang focus (keyboard nav j/k). */
  focusedIndex?: number;
}

/**
 * ItemListTable — redesigned (design-spec §2.4 + brainstorm-deep §2.2).
 *
 * - Virtualized với @tanstack/react-virtual.
 * - Row height 40px (compact) / 56px (comfort). Auto 56px ≤ 1024px.
 * - Sticky first col SKU + Actions last col.
 * - Checkbox 3-mode selection (visible / all-matching / none).
 * - Skeleton khi loading. Không dùng trong loading page-level — page dùng
 *   ItemsLoadingSkeleton wrapper.
 */
export function ItemListTable({
  rows,
  loading,
  selection,
  onToggleRow,
  onTogglePage,
  onEdit,
  onPreview,
  density = "compact",
  focusedIndex,
}: ItemListTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowHeight = density === "comfort" ? 56 : 40;

  const visibleIds = React.useMemo(() => rows.map((r) => r.id), [rows]);
  const pageState = pageSelectState(selection, visibleIds);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  // Scroll focused row into view
  React.useEffect(() => {
    if (focusedIndex !== undefined && focusedIndex >= 0) {
      virt.scrollToIndex(focusedIndex, { align: "auto" });
    }
  }, [focusedIndex, virt]);

  const copySku = React.useCallback((sku: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(sku);
      toast.success(`Đã copy ${sku}`);
    }
  }, []);

  const gridCols =
    "grid-cols-[40px_140px_minmax(0,1fr)_110px_60px_100px_140px_110px_120px]";

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded border border-slate-200 bg-white"
      role="region"
      aria-label="Danh mục vật tư"
    >
      <table className="sr-only">
        <caption>Danh mục vật tư</caption>
      </table>

      <div
        className={cn(
          "sticky top-0 z-sticky grid items-center border-b border-slate-200 bg-slate-100 px-3 text-xs font-semibold uppercase text-slate-700",
          gridCols,
        )}
        style={{ height: 40 }}
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
        <div role="columnheader">SKU</div>
        <div role="columnheader">Tên</div>
        <div role="columnheader">Loại</div>
        <div role="columnheader">UoM</div>
        <div role="columnheader" className="text-right">On-hand</div>
        <div role="columnheader">Nhóm</div>
        <div role="columnheader">Trạng thái</div>
        <div role="columnheader" className="text-center">Thao tác</div>
      </div>

      {loading && rows.length === 0 && (
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "grid items-center border-b border-slate-100 px-3",
                gridCols,
              )}
              style={{ height: rowHeight }}
            >
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-20 rounded-sm" />
              <Skeleton className="h-4 w-16" />
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
          const checked = isSelected(selection, row.id);
          const isFocused = focusedIndex === v.index;
          return (
            <div
              key={row.id}
              role="row"
              style={{
                transform: `translateY(${v.start}px)`,
                height: `${v.size}px`,
              }}
              className={cn(
                "absolute left-0 top-0 grid w-full items-center border-b border-slate-100 px-3 text-sm transition-colors",
                "hover:bg-slate-50",
                checked && "bg-info-soft/40",
                isFocused && "ring-2 ring-info/40 bg-slate-50",
                v.index % 2 === 1 && !checked && "bg-zebra",
                gridCols,
              )}
            >
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggleRow(row.id)}
                  aria-label={`Chọn vật tư ${row.sku}`}
                />
              </div>
              <Link
                href={`/items/${row.id}`}
                className="truncate font-mono text-xs text-slate-900 hover:text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/35"
                title={row.sku}
              >
                {row.sku}
              </Link>
              <Link
                href={`/items/${row.id}`}
                className="truncate text-slate-900 hover:text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/35"
                title={row.name}
              >
                {row.name}
              </Link>
              <div className="truncate text-slate-600" title={ITEM_TYPE_LABELS[row.itemType]}>
                {ITEM_TYPE_LABELS[row.itemType]}
              </div>
              <div className="text-slate-600">{row.uom}</div>
              <div className="text-right tabular-nums text-slate-600">
                {row.onHand !== null && row.onHand !== undefined
                  ? formatNumber(row.onHand)
                  : "—"}
              </div>
              <div className="truncate text-slate-600" title={row.category ?? ""}>
                {row.category ?? "—"}
              </div>
              <div>
                <StatusBadge
                  status={row.isActive ? "active" : "inactive"}
                  size="sm"
                  label={row.isActive ? "Active" : "Đã xoá"}
                />
              </div>
              <div className="flex items-center justify-center gap-0.5">
                {onPreview && (
                  <button
                    type="button"
                    onClick={() => onPreview(row)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:shadow-focus"
                    aria-label={`Xem nhanh ${row.sku}`}
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:shadow-focus"
                  aria-label={`Sửa ${row.sku}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => copySku(row.sku)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:shadow-focus"
                  aria-label={`Copy SKU ${row.sku}`}
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
