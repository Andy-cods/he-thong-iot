"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ShortageRow } from "@/hooks/useShortage";

export interface ShortageListTableProps {
  rows: ShortageRow[];
  loading?: boolean;
  selectedIds: Set<string>;
  onToggle: (itemId: string) => void;
  onTogglePage: (ids: string[]) => void;
  onCreatePRSingle: (itemId: string) => void;
}

/**
 * ShortageListTable — compact row 36px, virtualize > 50 rows.
 * Cols: [Checkbox 32][SKU 120 mono][Tên 1fr][Total Required 96 right]
 *       [On Order 96 right][Short 112 right orange][Order count 64 center]
 *       [Action 88 center]
 */
export function ShortageListTable({
  rows,
  loading,
  selectedIds,
  onToggle,
  onTogglePage,
  onCreatePRSingle,
}: ShortageListTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
  });

  const allChecked =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.componentItemId));
  const someChecked = rows.some((r) => selectedIds.has(r.componentItemId));
  const pageState: "checked" | "indeterminate" | "unchecked" = allChecked
    ? "checked"
    : someChecked
    ? "indeterminate"
    : "unchecked";

  const gridCols =
    "grid-cols-[32px_120px_minmax(0,1fr)_96px_96px_112px_64px_88px]";

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded-md border border-zinc-200 bg-white"
      role="region"
      aria-label="Shortage board"
    >
      <div
        className={cn(
          "sticky top-0 z-sticky grid h-8 items-center border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wide text-zinc-500",
          gridCols,
        )}
      >
        <div className="flex items-center justify-center">
          <Checkbox
            aria-label="Chọn tất cả"
            checked={
              pageState === "indeterminate" ? "indeterminate" : allChecked
            }
            onCheckedChange={() =>
              onTogglePage(rows.map((r) => r.componentItemId))
            }
          />
        </div>
        <div>SKU</div>
        <div>Tên vật tư</div>
        <div className="text-right">Yêu cầu</div>
        <div className="text-right">Đang đặt</div>
        <div className="text-right">Thiếu</div>
        <div className="text-center">Đơn</div>
        <div className="text-center">Thao tác</div>
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
              <Skeleton className="h-3.5 w-3.5" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-6" />
              <Skeleton className="h-6 w-14" />
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
          const checked = selectedIds.has(row.componentItemId);
          return (
            <div
              key={row.componentItemId}
              style={{
                transform: `translateY(${v.start}px)`,
                height: `${v.size}px`,
              }}
              className={cn(
                "absolute left-0 top-0 grid w-full items-center border-b border-zinc-100 px-3 text-base text-zinc-900 transition-colors hover:bg-zinc-50",
                checked && "bg-blue-50",
                gridCols,
              )}
            >
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggle(row.componentItemId)}
                  aria-label={`Chọn ${row.componentSku}`}
                />
              </div>
              <div className="truncate font-mono text-sm text-zinc-700" title={row.componentSku}>
                {row.componentSku}
              </div>
              <div className="truncate text-sm" title={row.componentName}>
                {row.componentName}
              </div>
              <div className="text-right tabular-nums text-zinc-700">
                {formatNumber(row.totalRequired)}
              </div>
              <div className="text-right tabular-nums text-zinc-700">
                {formatNumber(row.totalOnOrder)}
              </div>
              <div className="text-right font-semibold tabular-nums text-orange-700">
                {formatNumber(row.totalShort)}
              </div>
              <div className="text-center text-sm text-zinc-600 tabular-nums">
                {row.orderCount}
              </div>
              <div className="flex items-center justify-center">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onCreatePRSingle(row.componentItemId)}
                  className="h-7 gap-1 px-2 text-xs"
                  aria-label={`Tạo PR cho ${row.componentSku}`}
                >
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  Tạo PR
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
