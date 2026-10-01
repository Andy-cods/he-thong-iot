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
import { RowActionsMenu } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-badge";
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
  onRename?: (row: BomRow, newName: string) => Promise<void>;
  focusedIndex?: number;
  /** V2.1 — sort state for header click. */
  sortField?: BomSortField;
  sortDir?: BomSortDir;
  onSortChange?: (field: BomSortField) => void;
}

// V4.1 UI-07: bỏ map STATUS_DOT cục bộ ("Hoạt động"/"Ngừng") — nhãn + tông lấy từ
// lib/status.ts (domain "bom": Nháp / Đang dùng / Ngừng dùng), khớp chip lọc.

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
        "inline-flex items-center gap-1 transition-colors hover:text-zinc-900 dark:hover:text-zinc-50",
        active && "text-zinc-900 dark:text-zinc-50",
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

function InlineRenameCell({
  row,
  onRename,
}: {
  row: BomRow;
  onRename?: (row: BomRow, newName: string) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(row.name);
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const save = async () => {
    const trimmed = val.trim();
    if (!trimmed || trimmed === row.name) {
      setEditing(false);
      setVal(row.name);
      return;
    }
    setSaving(true);
    try {
      await onRename?.(row, trimmed);
      setEditing(false);
    } catch {
      setVal(row.name);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") {
            setEditing(false);
            setVal(row.name);
          }
        }}
        onBlur={() => void save()}
        className="w-full rounded border border-indigo-400 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-indigo-500 dark:bg-zinc-900 dark:text-zinc-50"
        disabled={saving}
      />
    );
  }

  return (
    <span className="group/name flex items-center gap-1 min-w-0">
      <span className={cn("truncate", saving && "opacity-50")}>{row.name}</span>
      {onRename && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="invisible shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 group-hover/name:visible dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Đổi tên BOM"
        >
          <Pencil className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
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
  onRename,
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
      toast.success(`Đã sao chép ${code}`);
    }
  }, []);

  // V4.4 D.B — cột "Thành phẩm" (parentItemSku) hay rỗng 100% (BOM không gắn
  // parentItemId) nhưng vẫn chiếm chỗ cố định (N4). Ẩn hẳn cột khi KHÔNG có
  // dòng nào trong trang hiện tại có dữ liệu — tự hiện lại nếu API sau này
  // trả parentItemSku (không cần sửa UI lần nữa). Root cause (thiếu JOIN ở
  // server/repos/bomTemplates.ts) ngoài phạm vi UI thuần — xem status-D.md.
  const hasParentItem = React.useMemo(
    () => rows.some((r) => !!r.parentItemSku),
    [rows],
  );

  // Mobile: 4 col primary (checkbox + code + name + status).
  // md+: full (thêm [parent nếu có data]/lines/target/updated/actions).
  // V4.1 UI-11 (Đợt 6C): gap-x giữa cột — trước dính "SL MỤC TIÊUTRẠNG THÁI" / số sát pill.
  const gridCols = cn(
    "grid-cols-[32px_96px_minmax(0,1fr)_88px] gap-x-2",
    hasParentItem
      ? "md:grid-cols-[32px_128px_minmax(0,1fr)_128px_72px_88px_112px_104px_104px] md:gap-x-3"
      : "md:grid-cols-[32px_128px_minmax(0,1fr)_72px_88px_112px_104px_104px] md:gap-x-3",
  );

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-auto rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      /* V4.4 A1 — trước chỉ role="region", các `role="row"` con KHÔNG HỢP LỆ
       * theo spec ARIA (row phải nằm trong table/grid/treegrid) → trình đọc
       * màn hình bỏ qua toàn bộ ngữ nghĩa bảng. role="table" (không dùng
       * "grid" vì bảng này không có điều hướng bàn phím 2 chiều kiểu grid). */
      role="table"
      aria-label="Danh sách BOM"
      aria-rowcount={rows.length + 1}
    >
      {/* Header */}
      <div
        className={cn(
          "sticky top-0 z-sticky grid h-8 items-center border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400",
          gridCols,
        )}
        role="row"
      >
        <div className="flex items-center justify-center" role="columnheader">
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
        {hasParentItem && (
          <div role="columnheader" className="hidden md:block">
            {/* V4.1 UI-27: Parent item → Thành phẩm */}
            Thành phẩm
          </div>
        )}
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
          SL mục tiêu
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
        <div role="columnheader" className="hidden text-right md:block">
          Thao tác
        </div>
      </div>

      {loading && rows.length === 0 && (
        <div>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "grid items-center border-b border-zinc-100 px-3 dark:border-zinc-800",
                gridCols,
              )}
              style={{ height: rowHeight }}
            >
              {/* V4.4 D.B: rows rỗng lúc loading → hasParentItem=false → khớp
                  đúng gridCols 8-cột hiện tại (cột thật tự hiện lại nếu data
                  về có parentItemSku, chấp nhận 1 nhịp reflow nhỏ). */}
              <Skeleton className="h-3.5 w-3.5" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-48" />
              {hasParentItem && (
                <Skeleton className="hidden h-3 w-20 md:block" />
              )}
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
                "absolute left-0 top-0 grid w-full items-center border-b border-zinc-100 px-3 text-base text-zinc-900 transition-colors duration-100 dark:border-zinc-800 dark:text-zinc-100",
                "hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:-outline-offset-2",
                checked && "bg-indigo-50 dark:bg-indigo-950/40",
                isFocused &&
                  "bg-zinc-50 outline outline-2 -outline-offset-2 outline-indigo-500 dark:bg-zinc-800/60",
                gridCols,
              )}
              tabIndex={-1}
            >
              <div className="flex items-center justify-center" role="cell">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggleRow(row.id)}
                  aria-label={`Chọn BOM ${row.code}`}
                />
              </div>

              <Link
                href={`/bom/${row.id}`}
                role="cell"
                className={cn(
                  "sticky left-0 truncate border-r border-zinc-100 bg-white pr-2 font-mono text-sm text-zinc-700 hover:text-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-indigo-300",
                  checked && "bg-indigo-50 dark:bg-indigo-950/40",
                  isFocused && !checked && "bg-zinc-50 dark:bg-zinc-800/60",
                )}
                title={row.code}
              >
                {row.code}
              </Link>

              <div className="min-w-0 pr-2" role="cell">
                {onRename ? (
                  <InlineRenameCell row={row} onRename={onRename} />
                ) : (
                  <Link
                    href={`/bom/${row.id}`}
                    className="truncate text-zinc-900 hover:text-indigo-600 focus-visible:outline-none focus-visible:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-300 dark:focus-visible:text-indigo-300"
                    title={row.name}
                  >
                    {row.name}
                  </Link>
                )}
              </div>

              {hasParentItem && (
                <div
                  className="hidden truncate font-mono text-sm text-zinc-600 md:block dark:text-zinc-400"
                  role="cell"
                  title={
                    row.parentItemSku
                      ? `${row.parentItemSku} — ${row.parentItemName ?? ""}`
                      : ""
                  }
                >
                  {row.parentItemSku ?? "—"}
                </div>
              )}

              <div className="hidden text-right tabular-nums text-zinc-700 md:block dark:text-zinc-300" role="cell">
                {formatNumber(row.componentCount)}
              </div>

              <div className="hidden text-right tabular-nums text-zinc-700 md:block dark:text-zinc-300" role="cell">
                {formatNumber(Number(row.targetQty))}
              </div>

              <div role="cell">
                <StatusPill domain="bom" code={row.status} dot />
              </div>

              <div className="hidden truncate text-xs text-zinc-500 md:block dark:text-zinc-400" role="cell">
                {formatDate(row.updatedAt, "dd/MM/yyyy HH:mm")}
              </div>

              <div className="hidden items-center justify-end gap-0.5 md:flex" role="cell">
                {onPreview && (
                  <button
                    type="button"
                    onClick={() => onPreview(row)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                    aria-label={`Xem ${row.code}`}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                <Link
                  href={`/bom/${row.id}/grid`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-400 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                  aria-label={`Mở bảng BOM ${row.code}`}
                  title="Mở bảng BOM"
                >
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                {/* V4.1 UI-12 (Đợt 6C): tối đa 2 icon hiện sẵn; Sửa / Sao chép / Nhân bản /
                    Xoá (phá huỷ, chữ đỏ) vào menu ⋯ — hết nút xoá đỏ mỗi dòng. */}
                <RowActionsMenu
                  label={`Thao tác ${row.code}`}
                  actions={[
                    { label: "Sửa", icon: Pencil, onSelect: () => onEdit(row) },
                    { label: "Sao chép mã", icon: Copy, onSelect: () => copyCode(row.code) },
                    { label: "Nhân bản", icon: GitBranch, onSelect: () => onClone?.(row), hidden: !onClone },
                    { label: "Xoá BOM", icon: Trash2, danger: true, onSelect: () => onDelete?.(row), hidden: !onDelete },
                  ]}
                />
              </div>
            </div>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                align="start"
                sideOffset={12}
                className="max-w-[320px] bg-white p-3 text-zinc-900 ring-1 ring-zinc-200 shadow-md dark:bg-zinc-900 dark:text-zinc-50 dark:ring-zinc-700"
              >
                <div className="space-y-2">
                  <div>
                    <div className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                      {row.code}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">
                      {row.name}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-800">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                        Mã thành phẩm
                      </div>
                      <div className="font-mono text-zinc-700 dark:text-zinc-300">
                        {row.parentItemSku ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                        Sheet
                      </div>
                      <div className="tabular-nums text-zinc-700 dark:text-zinc-300">
                        {formatNumber(sheetCount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                        Linh kiện
                      </div>
                      <div className="tabular-nums text-zinc-700 dark:text-zinc-300">
                        {formatNumber(row.componentCount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                        Cập nhật
                      </div>
                      <div className="tabular-nums text-zinc-700 dark:text-zinc-300">
                        {formatDate(row.updatedAt, "dd/MM/yyyy HH:mm")}
                      </div>
                    </div>
                  </div>
                  {row.description && (
                    <div className="border-t border-zinc-100 pt-2 dark:border-zinc-800">
                      <div className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                        Mô tả
                      </div>
                      <div className="line-clamp-3 text-xs text-zinc-600 dark:text-zinc-400">
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
