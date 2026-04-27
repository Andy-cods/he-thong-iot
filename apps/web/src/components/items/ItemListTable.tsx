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
  /** V1.9 P6 — inventory aggregate từ API (totalQty, availableQty, reservedQty). */
  inventorySummary?: {
    totalQty: number;
    availableQty: number;
    reservedQty: number;
  };
  /** TASK-20260427-017 — min stock threshold để render badge "Thiếu" amber. */
  minStockQty?: number | string | null;
  /** @deprecated legacy — dùng inventorySummary.totalQty thay thế. */
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
  /** "compact" 36px (V2 default) / "comfort" 44px (touch fallback). */
  density?: "compact" | "comfort";
  /** Row index đang focus (keyboard nav j/k). */
  focusedIndex?: number;
}

/**
 * V2 ItemListTable — Linear-inspired compact (design-spec §2.4 + impl-plan §8.T7).
 *
 * - Row height 36px (h-9 V2) — thay 40/56px V1.
 * - No zebra stripe — chỉ border-b zinc-100 1px.
 * - Header row h-8 bg-zinc-50 text-xs (11px) uppercase tracking-wide zinc-500.
 * - Data row text-base (13px), hover bg-zinc-50, selected bg-blue-50 border-l-2 blue-500.
 * - Virtualized với @tanstack/react-virtual estimateSize=36.
 * - Columns: [checkbox 32px] [SKU mono sticky 128px] [Tên 1fr] [Loại 96px]
 *            [UoM 64px] [Danh mục 112px] [Tồn 80px right] [Trạng thái 80px]
 *            [Actions 96px center].
 * - Actions: Eye (preview) / Pencil (edit) / Copy (SKU clipboard) — icon 14px.
 * - Focus ring blue-500 outline 2px (V2 thay shadow-focus V1).
 * - Keyboard focus bg-zinc-50 + ring-inset blue-500.
 * - SKU sticky left-0 bg-white border-r zinc-100 font-mono 12px.
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
  const rowHeight = density === "comfort" ? 44 : 36;

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

  // Mobile: 4 col (checkbox/SKU/Tên/Status). md+: full 9 col với Loại/UoM/Danh mục/Tồn/Actions.
  // V1.9 P6: tăng cột Tồn kho lên 128px (2-line display) + gap-x-3 giữa các cột.
  const gridCols = cn(
    "grid-cols-[32px_96px_minmax(0,1fr)_80px] gap-x-2",
    "md:grid-cols-[32px_128px_minmax(0,1fr)_96px_64px_112px_128px_80px_96px] md:gap-x-3",
  );

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded-md border border-zinc-200 bg-white"
      role="region"
      aria-label="Danh mục vật tư"
    >
      <table className="sr-only">
        <caption>Danh mục vật tư</caption>
      </table>

      {/* Header row — h-8 bg-zinc-50 11px uppercase */}
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
        <div role="columnheader">SKU</div>
        <div role="columnheader">Tên</div>
        <div role="columnheader" className="hidden md:block">
          Loại
        </div>
        <div role="columnheader" className="hidden md:block">
          UoM
        </div>
        <div role="columnheader" className="hidden md:block">
          Danh mục
        </div>
        <div role="columnheader" className="hidden text-right md:block">
          Tồn kho
        </div>
        <div role="columnheader">Trạng thái</div>
        <div role="columnheader" className="hidden text-center md:block">
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
              <Skeleton className="hidden h-3 w-16 md:block" />
              <Skeleton className="hidden h-3 w-8 md:block" />
              <Skeleton className="hidden h-3 w-16 md:block" />
              <Skeleton className="hidden h-3 w-12 md:block" />
              <Skeleton className="h-4 w-16 rounded-sm" />
              <Skeleton className="hidden h-3 w-16 md:block" />
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
                isFocused && "bg-zinc-50 outline outline-2 -outline-offset-2 outline-blue-500",
                gridCols,
              )}
              tabIndex={-1}
            >
              {/* Checkbox cell */}
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggleRow(row.id)}
                  aria-label={`Chọn vật tư ${row.sku}`}
                />
              </div>

              {/* SKU — sticky left-0 border-r, font-mono 12px */}
              <Link
                href={`/items/${row.id}`}
                className={cn(
                  "sticky left-0 truncate border-r border-zinc-100 bg-white pr-2 font-mono text-sm text-zinc-700 hover:text-blue-600",
                  "focus-visible:outline-none focus-visible:text-blue-600",
                  checked && "bg-blue-50",
                  isFocused && !checked && "bg-zinc-50",
                )}
                title={row.sku}
              >
                {row.sku}
              </Link>

              {/* Name — flex-1 truncate */}
              <Link
                href={`/items/${row.id}`}
                className="truncate pr-2 text-zinc-900 hover:text-blue-600 focus-visible:outline-none focus-visible:text-blue-600"
                title={row.name}
              >
                {row.name}
              </Link>

              {/* Loại — badge-like text (ẩn < md) */}
              <div
                className="hidden truncate text-zinc-600 md:block"
                title={ITEM_TYPE_LABELS[row.itemType]}
              >
                {ITEM_TYPE_LABELS[row.itemType]}
              </div>

              {/* UoM (ẩn < md) */}
              <div className="hidden text-zinc-500 md:block">{row.uom}</div>

              {/* Danh mục (ẩn < md) */}
              <div
                className="hidden truncate text-zinc-600 md:block"
                title={row.category ?? ""}
              >
                {row.category ?? "—"}
              </div>

              {/* Tồn kho — V1.9 P6 + TASK-20260427-017:
                    - Available cell color đỏ nếu ≤ 0, amber nếu < minStock.
                    - Tooltip hiển thị on-hand / reserved chi tiết. */}
              <div className="hidden flex-col items-end justify-center whitespace-nowrap pr-2 tabular-nums text-zinc-700 md:flex">
                {row.inventorySummary ? (
                  (() => {
                    const sum = row.inventorySummary;
                    const minStock = Number(row.minStockQty ?? 0) || 0;
                    const availColor =
                      sum.availableQty <= 0
                        ? "text-rose-700"
                        : minStock > 0 && sum.availableQty < minStock
                          ? "text-amber-700"
                          : "text-zinc-900";
                    return (
                      <span
                        title={`On-hand: ${formatNumber(sum.totalQty)} ${row.uom}\nReserved: ${formatNumber(sum.reservedQty)} ${row.uom}\nAvailable: ${formatNumber(sum.availableQty)} ${row.uom}${minStock > 0 ? `\nMin stock: ${formatNumber(minStock)}` : ""}`}
                        className="flex flex-col items-end"
                      >
                        <span
                          className={`text-sm font-medium ${availColor}`}
                        >
                          {formatNumber(sum.availableQty)}{" "}
                          <span className="text-xs font-normal text-zinc-500">
                            {row.uom}
                          </span>
                        </span>
                        <span className="text-[10px] leading-tight text-zinc-500">
                          Tổng:{" "}
                          <span className="tabular-nums text-zinc-700">
                            {formatNumber(sum.totalQty)}
                          </span>
                          {sum.reservedQty > 0 && (
                            <>
                              {" · Giữ: "}
                              <span className="tabular-nums text-amber-600">
                                {formatNumber(sum.reservedQty)}
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                    );
                  })()
                ) : row.onHand !== null && row.onHand !== undefined ? (
                  <span>{formatNumber(row.onHand)}</span>
                ) : (
                  <span>—</span>
                )}
              </div>

              {/* Status badge sm V2 */}
              <div>
                <StatusBadge
                  status={row.isActive ? "active" : "inactive"}
                  size="sm"
                  label={row.isActive ? "Active" : "Đã xoá"}
                />
              </div>

              {/* Actions — icon buttons h-7 w-7 ghost (ẩn < md) */}
              <div className="hidden items-center justify-center gap-0.5 md:flex">
                {onPreview && (
                  <button
                    type="button"
                    onClick={() => onPreview(row)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-0"
                    aria-label={`Xem nhanh ${row.sku}`}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-0"
                  aria-label={`Sửa ${row.sku}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => copySku(row.sku)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-0"
                  aria-label={`Copy SKU ${row.sku}`}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
