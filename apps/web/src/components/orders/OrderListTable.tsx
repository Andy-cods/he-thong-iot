"use client";

import * as React from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  SALES_ORDER_STATUS_LABELS,
  ORDER_PRIORITY_LABELS,
  type SalesOrderStatus,
  type OrderPriority,
} from "@iot/shared";
import { Checkbox } from "@/components/ui/checkbox";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isSelected,
  pageSelectState,
  type Selection,
} from "@/hooks/use-selection";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/format";

export interface OrderRow {
  id: string;
  orderNo: string;
  customerName: string;
  productName?: string | null;
  orderQty: string;
  dueDate: string | null;
  status: SalesOrderStatus;
  priority?: OrderPriority;
  readinessPercent?: number;
  updatedAt: string | Date;
}

export interface OrderListTableProps {
  rows: OrderRow[];
  loading?: boolean;
  selection: Selection;
  onToggleRow: (id: string) => void;
  onTogglePage: (visibleIds: string[]) => void;
  onPreview?: (row: OrderRow) => void;
  onEdit?: (row: OrderRow) => void;
  focusedIndex?: number;
}

function statusToBadge(status: SalesOrderStatus): {
  badgeStatus: BadgeStatus;
  label: string;
} {
  const label = SALES_ORDER_STATUS_LABELS[status];
  switch (status) {
    case "DRAFT":
      return { badgeStatus: "draft", label };
    case "CONFIRMED":
      return { badgeStatus: "info", label };
    case "SNAPSHOTTED":
      return { badgeStatus: "info", label };
    case "IN_PROGRESS":
      return { badgeStatus: "pending", label };
    case "FULFILLED":
      return { badgeStatus: "success", label };
    case "CLOSED":
      return { badgeStatus: "inactive", label };
    case "CANCELLED":
      return { badgeStatus: "danger", label };
  }
}

function priorityToBadge(priority: OrderPriority | undefined): {
  badgeStatus: BadgeStatus;
  label: string;
} | null {
  if (!priority) return null;
  const label = ORDER_PRIORITY_LABELS[priority];
  switch (priority) {
    case "LOW":
      return { badgeStatus: "neutral", label };
    case "NORMAL":
      return { badgeStatus: "info", label };
    case "HIGH":
      return { badgeStatus: "warning", label };
    case "URGENT":
      return { badgeStatus: "danger", label };
  }
}

/**
 * V2 OrderListTable — compact row 36px theo pattern BomListTable.
 * Columns: [checkbox 32][Code 128 mono][Customer 1fr][Product 180][Deadline 96]
 *          [Priority 80][Status 112][Readiness 80 right][Actions 96].
 */
export function OrderListTable({
  rows,
  loading,
  selection,
  onToggleRow,
  onTogglePage,
  onPreview,
  onEdit,
  focusedIndex,
}: OrderListTableProps) {
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

  // Mobile 4 col + md 9 col.
  const gridCols = cn(
    "grid-cols-[32px_128px_minmax(0,1fr)_112px]",
    "md:grid-cols-[32px_128px_minmax(0,1fr)_180px_104px_80px_112px_80px_96px]",
  );

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded-md border border-zinc-200 bg-white"
      role="region"
      aria-label="Danh sách đơn hàng"
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
        <div role="columnheader">Mã đơn</div>
        <div role="columnheader">Khách hàng</div>
        <div role="columnheader" className="hidden md:block">
          Sản phẩm
        </div>
        <div role="columnheader" className="hidden md:block">
          Deadline
        </div>
        <div role="columnheader" className="hidden md:block">
          Ưu tiên
        </div>
        <div role="columnheader">Trạng thái</div>
        <div role="columnheader" className="hidden text-right md:block">
          Sẵn sàng
        </div>
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
              <Skeleton className="hidden h-3 w-32 md:block" />
              <Skeleton className="hidden h-3 w-16 md:block" />
              <Skeleton className="hidden h-4 w-14 rounded-sm md:block" />
              <Skeleton className="h-4 w-20 rounded-sm" />
              <Skeleton className="hidden h-3 w-10 md:block" />
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
          const badge = statusToBadge(row.status);
          const prio = priorityToBadge(row.priority);

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
                  aria-label={`Chọn đơn ${row.orderNo}`}
                />
              </div>

              <Link
                href={`/orders/${row.orderNo}`}
                className={cn(
                  "sticky left-0 truncate border-r border-zinc-100 bg-white pr-2 font-mono text-sm text-zinc-700 hover:text-blue-600",
                  checked && "bg-blue-50",
                  isFocused && !checked && "bg-zinc-50",
                )}
                title={row.orderNo}
              >
                {row.orderNo}
              </Link>

              <Link
                href={`/orders/${row.orderNo}`}
                className="truncate pr-2 text-zinc-900 hover:text-blue-600 focus-visible:outline-none focus-visible:text-blue-600"
                title={row.customerName}
              >
                {row.customerName}
              </Link>

              <div
                className="hidden truncate text-zinc-700 md:block"
                title={row.productName ?? ""}
              >
                {row.productName ?? "—"}
              </div>

              <div className="hidden truncate text-sm text-zinc-600 tabular-nums md:block">
                {row.dueDate ? formatDate(row.dueDate, "dd/MM/yyyy") : "—"}
              </div>

              <div className="hidden md:block">
                {prio ? (
                  <StatusBadge
                    status={prio.badgeStatus}
                    size="sm"
                    label={prio.label}
                  />
                ) : (
                  <span className="text-xs text-zinc-400">—</span>
                )}
              </div>

              <div>
                <StatusBadge
                  status={badge.badgeStatus}
                  size="sm"
                  label={badge.label}
                />
              </div>

              <div className="hidden text-right tabular-nums text-zinc-700 md:block">
                {row.readinessPercent === undefined
                  ? "—"
                  : `${formatNumber(row.readinessPercent)}%`}
              </div>

              <div className="hidden items-center justify-center gap-0.5 md:flex">
                {onPreview && (
                  <button
                    type="button"
                    onClick={() => onPreview(row)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                    aria-label={`Xem ${row.orderNo}`}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                    aria-label={`Sửa ${row.orderNo}`}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyCode(row.orderNo)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  aria-label={`Copy mã ${row.orderNo}`}
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
