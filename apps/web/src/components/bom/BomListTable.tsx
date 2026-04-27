"use client";

import * as React from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Eye,
  LayoutGrid,
  Pencil,
  GitBranch,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { type BomStatus } from "@iot/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  description?: string | null;
  parentItemSku: string | null;
  parentItemName: string | null;
  targetQty: string;
  status: BomStatus;
  componentCount: number;
  /** Optional sheet count (proxy nếu API chưa trả). */
  sheetCount?: number | null;
  updatedAt: string | Date;
}

export type BomSortField = "code" | "name" | "componentCount" | "updatedAt";
export type BomSortDir = "asc" | "desc";

export interface BomListTableProps {
  rows: BomRow[];
  loading?: boolean;
  selection: Selection;
  onToggleRow: (id: string) => void;
  onTogglePage: (visibleIds: string[]) => void;
  onEdit: (row: BomRow) => void;
  onPreview?: (row: BomRow) => void;
  onClone?: (row: BomRow) => void;
  onDelete?: (row: BomRow) => void;
  focusedIndex?: number;
  /** V2.1 — sort state for header click. */
  sortField?: BomSortField;
  sortDir?: BomSortDir;
  onSortChange?: (field: BomSortField) => void;
}

interface StatusDotMeta {
  label: string;
  dot: string;
  bg: string;
  text: string;
  border: string;
}

const STATUS_DOT: Record<BomStatus, StatusDotMeta> = {
  DRAFT: {
    label: "Nháp",
    dot: "bg-amber-500",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  ACTIVE: {
    label: "Hoạt động",
    dot: "bg-emerald-500",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  OBSOLETE: {
    label: "Ngừng",
    dot: "bg-zinc-400",
    bg: "bg-zinc-50",
    text: "text-zinc-600",
    border: "border-zinc-200",
  },
};

function StatusDotPill({ status }: { status: BomStatus }) {
  const meta = STATUS_DOT[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.bg,
        meta.text,
        meta.border,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 rounded-full", meta.dot)}
      />
      {meta.label}
    </span>
  );
}

function SortHeader({
  field,
  label,
  align = "left",
  sortField,
  sortDir,
  onSortChange,
}: {
  field: BomSortField;
  label: string;
  align?: "left" | "right";
  sortField?: BomSortField;
  sortDir?: BomSortDir;
  onSortChange?: (field: BomSortField) => void;
}) {
  const active = sortField === field;
  const Icon = active
    ? sortDir === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  if (!onSortChange) {
    return (
      <span className={cn(align === "right" && "block text-right")}>
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSortChange(field)}
      className={cn(
        "inline-flex items-center gap-1 transition-colors hover:text-zinc-900",
        active && "text-zinc-900",
        align === "right" && "ml-auto",
      )}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{label}</span>
      <Icon
        className={cn(
          "h-3 w-3 transition-opacity",
          active ? "opacity-100" : "opacity-40",
        )}
        aria-hidden="true"
      />
    </button>
  );
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
  onDelete,
  focusedIndex,
  sortField,
  sortDir,
  onSortChange,
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

  // Mobile: 4 col primary (checkbox + code + name + status).
  // md+: 9 col full (thêm parent/lines/target/updated/actions).
  const gridCols = cn(
    "grid-cols-[32px_96px_minmax(0,1fr)_80px]",
    "md:grid-cols-[32px_128px_minmax(0,1fr)_128px_72px_80px_96px_96px_112px]",
  );

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded-md border border-zinc-200 bg-white"
      role="region"
      aria-label="Danh sách BOM"
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
        <div role="columnheader">
          <SortHeader
            field="code"
            label="Mã BOM"
            sortField={sortField}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
        </div>
        <div role="columnheader">
          <SortHeader
            field="name"
            label="Tên"
            sortField={sortField}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
        </div>
        <div role="columnheader" className="hidden md:block">
          Parent item
        </div>
        <div role="columnheader" className="hidden text-right md:block">
          <SortHeader
            field="componentCount"
            label="Linh kiện"
            align="right"
            sortField={sortField}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
        </div>
        <div role="columnheader" className="hidden text-right md:block">
          Target Qty
        </div>
        <div role="columnheader">Trạng thái</div>
        <div role="columnheader" className="hidden md:block">
          <SortHeader
            field="updatedAt"
            label="Cập nhật"
            sortField={sortField}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
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
              <Skeleton className="hidden h-3 w-20 md:block" />
              <Skeleton className="hidden h-3 w-10 md:block" />
              <Skeleton className="hidden h-3 w-12 md:block" />
              <Skeleton className="h-4 w-16 rounded-sm" />
              <Skeleton className="hidden h-3 w-16 md:block" />
              <Skeleton className="hidden h-3 w-16 md:block" />
            </div>
          ))}
        </div>
      )}

      <TooltipProvider delayDuration={400}>
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
          const sheetCount =
            row.sheetCount ?? (row.componentCount > 0 ? 1 : 0);
          return (
            <Tooltip key={row.id}>
              <TooltipTrigger asChild>
            <div
              role="row"
              aria-selected={checked}
              style={{
                transform: `translateY(${v.start}px)`,
                height: `${v.size}px`,
              }}
              className={cn(
                "absolute left-0 top-0 grid w-full items-center border-b border-zinc-100 px-3 text-base text-zinc-900 transition-colors duration-100",
                "hover:bg-zinc-50",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:-outline-offset-2",
                checked && "bg-indigo-50",
                isFocused &&
                  "bg-zinc-50 outline outline-2 -outline-offset-2 outline-indigo-500",
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
                  "sticky left-0 truncate border-r border-zinc-100 bg-white pr-2 font-mono text-sm text-zinc-700 hover:text-indigo-600",
                  checked && "bg-indigo-50",
                  isFocused && !checked && "bg-zinc-50",
                )}
                title={row.code}
              >
                {row.code}
              </Link>

              <Link
                href={`/bom/${row.id}`}
                className="truncate pr-2 text-zinc-900 hover:text-indigo-600 focus-visible:outline-none focus-visible:text-indigo-600"
                title={row.name}
              >
                {row.name}
              </Link>

              <div
                className="hidden truncate font-mono text-sm text-zinc-600 md:block"
                title={
                  row.parentItemSku
                    ? `${row.parentItemSku} — ${row.parentItemName ?? ""}`
                    : ""
                }
              >
                {row.parentItemSku ?? "—"}
              </div>

              <div className="hidden text-right tabular-nums text-zinc-700 md:block">
                {formatNumber(row.componentCount)}
              </div>

              <div className="hidden text-right tabular-nums text-zinc-700 md:block">
                {formatNumber(Number(row.targetQty))}
              </div>

              <div>
                <StatusDotPill status={row.status} />
              </div>

              <div className="hidden truncate text-xs text-zinc-500 md:block">
                {formatDate(row.updatedAt, "dd/MM/yyyy HH:mm")}
              </div>

              <div className="hidden items-center justify-center gap-0.5 md:flex">
                {onPreview && (
                  <button
                    type="button"
                    onClick={() => onPreview(row)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                    aria-label={`Xem ${row.code}`}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                <Link
                  href={`/bom/${row.id}/grid`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
                  aria-label={`Grid Editor ${row.code}`}
                  title="Mở Grid Editor"
                >
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                  aria-label={`Sửa ${row.code}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => copyCode(row.code)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                  aria-label={`Copy mã ${row.code}`}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {onClone && (
                  <button
                    type="button"
                    onClick={() => onClone(row)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                    aria-label={`Clone ${row.code}`}
                  >
                    <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(row)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
                    aria-label={`Xoá ${row.code}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                align="start"
                sideOffset={12}
                className="max-w-[320px] bg-white p-3 text-zinc-900 ring-1 ring-zinc-200 shadow-md"
              >
                <div className="space-y-2">
                  <div>
                    <div className="font-mono text-xs font-semibold text-zinc-900">
                      {row.code}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-sm text-zinc-700">
                      {row.name}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 pt-2 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                        Parent SKU
                      </div>
                      <div className="font-mono text-zinc-700">
                        {row.parentItemSku ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                        Sheet
                      </div>
                      <div className="tabular-nums text-zinc-700">
                        {formatNumber(sheetCount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                        Linh kiện
                      </div>
                      <div className="tabular-nums text-zinc-700">
                        {formatNumber(row.componentCount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                        Cập nhật
                      </div>
                      <div className="tabular-nums text-zinc-700">
                        {formatDate(row.updatedAt, "dd/MM/yyyy HH:mm")}
                      </div>
                    </div>
                  </div>
                  {row.description && (
                    <div className="border-t border-zinc-100 pt-2">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                        Mô tả
                      </div>
                      <div className="line-clamp-3 text-xs text-zinc-600">
                        {row.description}
                      </div>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      </TooltipProvider>
    </div>
  );
}
