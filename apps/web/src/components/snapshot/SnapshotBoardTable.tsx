"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRightLeft, MoreHorizontal, Search } from "lucide-react";
import {
  BOM_SNAPSHOT_STATES,
  BOM_SNAPSHOT_STATE_LABELS,
  type BomSnapshotState,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StateMachineBadge } from "@/components/snapshot/StateMachineBadge";
import type { SnapshotLineRow } from "@/hooks/useSnapshots";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

/**
 * SnapshotBoardTable — compact row 36px theo pattern BomListTable.
 *
 * Columns: [L][SKU mono][Name 1fr][Gross right][OpenPO right][Recv right]
 *          [QC right][Rsrv right][Issued right][Asm right][Short right red]
 *          [State badge][Actions].
 *
 * Mobile: 5 col primary (L + SKU + Name + Short + State + Actions).
 * Desktop md+: full 14 col.
 *
 * Virtualize khi > 50 rows (react-virtual, rowHeight 36px, overscan 8).
 * Row click → expand Sheet bottom (caller xử lý onRowClick).
 */

export interface SnapshotBoardTableProps {
  rows: SnapshotLineRow[];
  loading?: boolean;
  onTransition: (row: SnapshotLineRow) => void;
  onRowClick?: (row: SnapshotLineRow) => void;
}

export function SnapshotBoardTable({
  rows,
  loading,
  onTransition,
  onRowClick,
}: SnapshotBoardTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowHeight = 36;
  const useVirtualize = rows.length > 50;

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    enabled: useVirtualize,
  });

  const gridCols = cn(
    "grid-cols-[32px_96px_minmax(0,1fr)_80px_80px_36px]",
    "md:grid-cols-[32px_128px_minmax(0,1fr)_80px_80px_80px_80px_80px_80px_80px_88px_128px_36px]",
  );

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded-md border border-zinc-200 bg-white"
      role="region"
      aria-label="Snapshot Board"
    >
      {/* Header */}
      <div
        className={cn(
          "sticky top-0 z-sticky grid h-8 items-center border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wide text-zinc-500",
          gridCols,
        )}
        role="row"
      >
        <div role="columnheader" className="text-center">
          L
        </div>
        <div role="columnheader">SKU</div>
        <div role="columnheader">Tên linh kiện</div>
        <div role="columnheader" className="hidden text-right md:block">
          Gross
        </div>
        <div role="columnheader" className="hidden text-right md:block">
          Open PO
        </div>
        <div role="columnheader" className="hidden text-right md:block">
          Recv
        </div>
        <div role="columnheader" className="hidden text-right md:block">
          QC
        </div>
        <div role="columnheader" className="hidden text-right md:block">
          Rsrv
        </div>
        <div role="columnheader" className="hidden text-right md:block">
          Issued
        </div>
        <div role="columnheader" className="hidden text-right md:block">
          Asm
        </div>
        <div role="columnheader" className="text-right md:text-right">
          Short
        </div>
        <div role="columnheader" className="hidden md:block">
          Trạng thái
        </div>
        <div role="columnheader" className="text-center" />
      </div>

      {loading && rows.length === 0 && (
        <div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "grid items-center border-b border-zinc-100 px-3",
                gridCols,
              )}
              style={{ height: rowHeight }}
            >
              <Skeleton className="h-3 w-4" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="hidden h-3 w-10 md:block" />
              <Skeleton className="hidden h-3 w-10 md:block" />
              <Skeleton className="hidden h-3 w-10 md:block" />
              <Skeleton className="hidden h-3 w-10 md:block" />
              <Skeleton className="hidden h-3 w-10 md:block" />
              <Skeleton className="hidden h-3 w-10 md:block" />
              <Skeleton className="hidden h-3 w-10 md:block" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="hidden h-4 w-20 rounded-sm md:block" />
              <Skeleton className="h-3 w-3" />
            </div>
          ))}
        </div>
      )}

      {useVirtualize ? (
        <div
          style={{ height: `${virt.getTotalSize()}px` }}
          className={cn("relative w-full", loading && rows.length === 0 && "hidden")}
        >
          {virt.getVirtualItems().map((v) => {
            const row = rows[v.index];
            if (!row) return null;
            return (
              <div
                key={row.id}
                style={{
                  transform: `translateY(${v.start}px)`,
                  height: `${v.size}px`,
                }}
                className="absolute left-0 top-0 w-full"
              >
                <SnapshotBoardRow
                  row={row}
                  gridCols={gridCols}
                  onTransition={onTransition}
                  onRowClick={onRowClick}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={cn(loading && rows.length === 0 && "hidden")}>
          {rows.map((row) => (
            <SnapshotBoardRow
              key={row.id}
              row={row}
              gridCols={gridCols}
              onTransition={onTransition}
              onRowClick={onRowClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SnapshotBoardRow({
  row,
  gridCols,
  onTransition,
  onRowClick,
}: {
  row: SnapshotLineRow;
  gridCols: string;
  onTransition: (r: SnapshotLineRow) => void;
  onRowClick?: (r: SnapshotLineRow) => void;
}) {
  const short = Number.parseFloat(row.remainingShortQty ?? "0");
  const isShort = short > 0;
  return (
    <div
      role="row"
      onClick={() => onRowClick?.(row)}
      className={cn(
        "grid h-9 w-full cursor-pointer items-center border-b border-zinc-100 px-3 text-base text-zinc-900 transition-colors duration-100",
        "hover:bg-zinc-50",
        isShort && "bg-orange-50/40",
        gridCols,
      )}
      tabIndex={-1}
    >
      <div className="text-center font-mono text-xs text-zinc-500">
        {row.level}
      </div>
      <div className="truncate font-mono text-sm text-zinc-700" title={row.path}>
        {row.componentSku}
      </div>
      <div className="truncate pr-2 text-zinc-900" title={row.componentName}>
        {row.componentName}
      </div>
      <div className="hidden text-right tabular-nums text-zinc-700 md:block">
        {formatNumber(Number(row.grossRequiredQty))}
      </div>
      <div className="hidden text-right tabular-nums text-zinc-700 md:block">
        {formatNumber(Number(row.openPurchaseQty))}
      </div>
      <div className="hidden text-right tabular-nums text-zinc-700 md:block">
        {formatNumber(Number(row.receivedQty))}
      </div>
      <div className="hidden text-right tabular-nums text-zinc-700 md:block">
        {formatNumber(Number(row.qcPassQty))}
      </div>
      <div className="hidden text-right tabular-nums text-zinc-700 md:block">
        {formatNumber(Number(row.reservedQty))}
      </div>
      <div className="hidden text-right tabular-nums text-zinc-700 md:block">
        {formatNumber(Number(row.issuedQty))}
      </div>
      <div className="hidden text-right tabular-nums text-zinc-700 md:block">
        {formatNumber(Number(row.assembledQty))}
      </div>
      <div
        className={cn(
          "text-right tabular-nums",
          isShort ? "font-semibold text-orange-700" : "text-zinc-400",
        )}
      >
        {short > 0 ? formatNumber(short) : "—"}
      </div>
      <div className="hidden md:block">
        <StateMachineBadge state={row.state} size="sm" />
      </div>
      <div
        className="flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onTransition(row)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          aria-label={`Chuyển trạng thái ${row.componentSku}`}
          title="Chuyển trạng thái"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * SnapshotBoardFilterBar — search SKU/name + multi-state dropdown + count.
 */
export interface SnapshotBoardFilterBarProps {
  q: string;
  onQChange: (v: string) => void;
  selectedStates: BomSnapshotState[];
  onStatesChange: (v: BomSnapshotState[]) => void;
  total: number;
  showing: number;
}

export function SnapshotBoardFilterBar({
  q,
  onQChange,
  selectedStates,
  onStatesChange,
  total,
  showing,
}: SnapshotBoardFilterBarProps) {
  const toggle = (s: BomSnapshotState) => {
    if (selectedStates.includes(s)) {
      onStatesChange(selectedStates.filter((x) => x !== s));
    } else {
      onStatesChange([...selectedStates, s]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-white px-4 py-2">
      <div className="relative min-w-[200px] flex-1 md:max-w-xs">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
          aria-hidden="true"
        />
        <Input
          type="search"
          size="sm"
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder="Tìm SKU / tên linh kiện..."
          className="pl-7"
          aria-label="Tìm linh kiện"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            Trạng thái
            {selectedStates.length > 0 && (
              <span className="ml-1 rounded-sm bg-blue-100 px-1 text-xs text-blue-700">
                {selectedStates.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {BOM_SNAPSHOT_STATES.map((s) => (
            <DropdownMenuCheckboxItem
              key={s}
              checked={selectedStates.includes(s)}
              onCheckedChange={() => toggle(s)}
              onSelect={(e) => e.preventDefault()}
            >
              {BOM_SNAPSHOT_STATE_LABELS[s]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {selectedStates.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onStatesChange([])}
          className="text-xs text-zinc-500"
        >
          Xoá filter
        </Button>
      )}
      <span className="ml-auto text-xs text-zinc-500">
        Hiển thị {showing} / {total} linh kiện
      </span>
    </div>
  );
}
