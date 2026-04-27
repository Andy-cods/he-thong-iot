"use client";

import * as React from "react";
import Link from "next/link";
import { Copy, Eye, LayoutGrid, Layers, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { type BomStatus } from "@iot/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/format";

export interface BomCardItem {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  parentItemSku?: string | null;
  status: BomStatus;
  componentCount: number;
  /** Heuristic: 0 sheet nếu componentCount===0, ngược lại ≥1. */
  sheetCount?: number;
  updatedAt: string | Date;
}

export interface BomCardGridProps {
  rows: BomCardItem[];
  loading?: boolean;
  onOpen: (row: BomCardItem) => void;
  onClone?: (row: BomCardItem) => void;
  onDelete?: (row: BomCardItem) => void;
}

/**
 * V2.1 BomCardGrid — TASK-20260427-029.
 *
 * Grid 1 col (sm) / 2 col (md) / 3 col (lg) / 4 col (xl). Mỗi card:
 *   ┌────────────────────────────────────┐
 *   │  CODE-MONO       [● status badge]  │
 *   │                                    │
 *   │  Tên BOM (line-clamp-2, font-md)   │
 *   │  Parent SKU · description preview  │
 *   │                                    │
 *   │  ┌──────┬──────┬──────┐            │
 *   │  │ #LK  │ Sheet│ Cập  │            │
 *   │  │  42  │   2  │ 21/4 │            │
 *   │  └──────┴──────┴──────┘            │
 *   │                                    │
 *   │  [hover overlay] Mở · Copy · Xoá   │
 *   └────────────────────────────────────┘
 *
 * - Hover: shadow-md + lift translate-y-[-1px], reveal action overlay.
 * - Click body → onOpen() → push `/bom/[id]/grid`.
 */
export function BomCardGrid({
  rows,
  loading,
  onOpen,
  onClone,
  onDelete,
}: BomCardGridProps) {
  if (loading && rows.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => (
        <BomCard
          key={row.id}
          row={row}
          onOpen={onOpen}
          onClone={onClone}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function BomCard({
  row,
  onOpen,
  onClone,
  onDelete,
}: {
  row: BomCardItem;
  onOpen: (row: BomCardItem) => void;
  onClone?: (row: BomCardItem) => void;
  onDelete?: (row: BomCardItem) => void;
}) {
  const sheetCount =
    row.sheetCount ?? (row.componentCount > 0 ? 1 : 0);
  const status = STATUS_DOT[row.status];

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(row.code);
      toast.success(`Đã copy ${row.code}`);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row);
        }
      }}
      className={cn(
        "group relative flex flex-col rounded-lg border border-zinc-200 bg-white p-4 text-left",
        "shadow-sm transition-all duration-150 ease-out",
        "hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-2",
        "cursor-pointer",
      )}
      aria-label={`Mở BOM ${row.code}`}
    >
      {/* Top: code + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="truncate font-mono text-md font-semibold tracking-tight text-zinc-900"
              title={row.code}
            >
              {row.code}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="opacity-0 transition-opacity hover:bg-zinc-100 group-hover:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:text-zinc-700"
              aria-label={`Copy mã ${row.code}`}
              tabIndex={-1}
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          {row.parentItemSku && (
            <div
              className="mt-0.5 truncate font-mono text-xs text-zinc-500"
              title={row.parentItemSku}
            >
              {row.parentItemSku}
            </div>
          )}
        </div>
        <StatusDotBadge meta={status} />
      </div>

      {/* Middle: name + description */}
      <div className="mt-3 min-h-[44px] flex-1">
        <h3
          className="line-clamp-2 text-base font-medium leading-snug text-zinc-900"
          title={row.name}
        >
          {row.name}
        </h3>
        {row.description && (
          <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
            {row.description}
          </p>
        )}
      </div>

      {/* Footer: 3 mini stats */}
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-md border border-zinc-100 bg-zinc-50/60 p-2">
        <Stat
          label="Linh kiện"
          value={formatNumber(row.componentCount)}
          tone={row.componentCount > 0 ? "default" : "muted"}
        />
        <Stat
          label="Sheet"
          value={formatNumber(sheetCount)}
          tone={sheetCount > 0 ? "default" : "muted"}
        />
        <Stat
          label="Cập nhật"
          value={formatDate(row.updatedAt, "dd/MM/yyyy")}
        />
      </div>

      {/* Hover quick actions overlay */}
      <div
        className={cn(
          "pointer-events-none absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity duration-150",
          "group-hover:pointer-events-auto group-hover:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Link
          href={`/bom/${row.id}/grid`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          aria-label={`Mở Grid ${row.code}`}
          title="Mở Grid Editor"
          onClick={(e) => e.stopPropagation()}
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(row);
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900"
          aria-label={`Xem ${row.code}`}
          title="Mở chi tiết"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {onClone && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClone(row);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900"
            aria-label={`Sao chép ${row.code}`}
            title="Sao chép"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(row);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-red-500 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            aria-label={`Xoá ${row.code}`}
            title="Xoá BOM"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <div className="text-center">
      <div
        className={cn(
          "text-sm font-semibold tabular-nums leading-tight",
          tone === "default" ? "text-zinc-900" : "text-zinc-400",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
    </div>
  );
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

function StatusDotBadge({ meta }: { meta: StatusDotMeta }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
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

function CardSkeleton() {
  return (
    <div className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mt-3 space-y-1.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-md border border-zinc-100 bg-zinc-50 p-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1 text-center">
            <Skeleton className="mx-auto h-3 w-8" />
            <Skeleton className="mx-auto h-2 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Convenience: empty cell icon used in card view header for "no data" indicator.
 * Exported in case parents want to reuse.
 */
export function BomCardEmptyHint() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
      <Layers className="h-4 w-4" aria-hidden="true" />
      Chưa có dữ liệu
    </div>
  );
}
