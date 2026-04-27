"use client";

import * as React from "react";
import {
  CalendarRange,
  Filter,
  LayoutGrid,
  List,
  Search,
  Sliders,
  X,
} from "lucide-react";
import { BOM_STATUS_LABELS, type BomStatus } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * V2.1 BomFilterBarPlus — TASK-20260427-029.
 *
 * Filter rich cho BOM List. KHÔNG thay BomFilterBar cũ (legacy pages
 * `/items` style vẫn xài). Đây là filter dành riêng cho engineering hub.
 *
 * Layout (desktop, single row):
 *   [Search 240] [Chip All|Draft|Active|Obs] [Filter +N] [Sort ▾] [View Toggle]
 *
 * - Status: multi-select chip group (toggle bật/tắt từng status, default "all").
 * - "Filter +N" popover: dateRange + minComponents slider + hasSheet boolean.
 * - Active filter count badge bật khi có filter ngoài search/status.
 * - View toggle table ↔ card (controlled via `view` prop).
 */

export type BomViewMode = "table" | "card";
export type BomSortKey =
  | "updatedAt:desc"
  | "updatedAt:asc"
  | "name:asc"
  | "name:desc"
  | "componentCount:desc"
  | "componentCount:asc";

export interface BomFilterPlusState {
  q: string;
  /** Multi-select status — empty array = "tất cả". */
  statuses: BomStatus[];
  /** ISO yyyy-MM-dd, "" = không filter. */
  dateFrom: string;
  dateTo: string;
  /** Số linh kiện ≥ minComponents. 0 = không filter. */
  minComponents: number;
  /** true = chỉ hiện BOM có ít nhất 1 sheet (proxy: componentCount > 0). */
  hasSheet: boolean;
}

export interface BomFilterBarPlusProps {
  state: BomFilterPlusState;
  onChange: (patch: Partial<BomFilterPlusState>) => void;
  onReset: () => void;
  onSearchInput: (v: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  totalCount?: number;
  view: BomViewMode;
  onViewChange: (v: BomViewMode) => void;
  sort: BomSortKey;
  onSortChange: (s: BomSortKey) => void;
}

const STATUS_CHIPS: Array<{ v: BomStatus; label: string; dot: string }> = [
  { v: "DRAFT", label: BOM_STATUS_LABELS.DRAFT, dot: "bg-amber-500" },
  { v: "ACTIVE", label: BOM_STATUS_LABELS.ACTIVE, dot: "bg-emerald-500" },
  { v: "OBSOLETE", label: BOM_STATUS_LABELS.OBSOLETE, dot: "bg-zinc-400" },
];

const SORT_OPTIONS: Array<{ v: BomSortKey; label: string }> = [
  { v: "updatedAt:desc", label: "Mới nhất" },
  { v: "updatedAt:asc", label: "Cũ nhất" },
  { v: "name:asc", label: "Tên A → Z" },
  { v: "name:desc", label: "Tên Z → A" },
  { v: "componentCount:desc", label: "Linh kiện: nhiều → ít" },
  { v: "componentCount:asc", label: "Linh kiện: ít → nhiều" },
];

export function BomFilterBarPlus({
  state,
  onChange,
  onReset,
  onSearchInput,
  searchInputRef,
  totalCount,
  view,
  onViewChange,
  sort,
  onSortChange,
}: BomFilterBarPlusProps) {
  const advancedCount =
    (state.dateFrom ? 1 : 0) +
    (state.dateTo ? 1 : 0) +
    (state.minComponents > 0 ? 1 : 0) +
    (state.hasSheet ? 1 : 0);

  const hasAnyFilter =
    state.q.trim().length > 0 ||
    state.statuses.length > 0 ||
    advancedCount > 0;

  const toggleStatus = (s: BomStatus) => {
    const next = state.statuses.includes(s)
      ? state.statuses.filter((x) => x !== s)
      : [...state.statuses, s];
    onChange({ statuses: next });
  };

  const sortLabel =
    SORT_OPTIONS.find((o) => o.v === sort)?.label ?? "Mới nhất";

  return (
    <div className="border-b border-zinc-200 bg-white px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            ref={searchInputRef}
            type="search"
            size="sm"
            placeholder="Tìm mã, tên, mô tả..."
            className="h-8 w-full pl-8 md:w-[260px]"
            aria-label="Tìm kiếm BOM"
            value={state.q}
            onChange={(e) => onSearchInput(e.target.value)}
          />
        </div>

        {/* Status chips multi-select */}
        <div
          role="group"
          aria-label="Lọc theo trạng thái"
          className="inline-flex items-center gap-1"
        >
          <button
            type="button"
            onClick={() => onChange({ statuses: [] })}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors",
              state.statuses.length === 0
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
            )}
          >
            Tất cả
          </button>
          {STATUS_CHIPS.map((opt) => {
            const active = state.statuses.includes(opt.v);
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => toggleStatus(opt.v)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    active ? "bg-white/90" : opt.dot,
                  )}
                />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Advanced filter popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1.5",
                advancedCount > 0 && "border-indigo-300 bg-indigo-50 text-indigo-700",
              )}
              aria-label="Bộ lọc nâng cao"
            >
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              Bộ lọc
              {advancedCount > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold tabular-nums text-white">
                  {advancedCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[320px] space-y-4"
          >
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-900">
                <CalendarRange className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                Ngày tạo
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs text-zinc-500">Từ</span>
                  <Input
                    type="date"
                    size="sm"
                    value={state.dateFrom}
                    onChange={(e) => onChange({ dateFrom: e.target.value })}
                    className="mt-0.5"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-zinc-500">Đến</span>
                  <Input
                    type="date"
                    size="sm"
                    value={state.dateTo}
                    onChange={(e) => onChange({ dateTo: e.target.value })}
                    className="mt-0.5"
                  />
                </label>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-900">
                <Sliders className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                Số linh kiện ≥{" "}
                <span className="font-mono text-indigo-600 tabular-nums">
                  {state.minComponents}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={state.minComponents}
                onChange={(e) =>
                  onChange({ minComponents: Number(e.target.value) })
                }
                className="w-full accent-indigo-600"
                aria-label="Số linh kiện tối thiểu"
              />
              <div className="mt-1 flex justify-between text-[10px] text-zinc-400 tabular-nums">
                <span>0</span>
                <span>50</span>
                <span>100</span>
                <span>200+</span>
              </div>
            </div>

            <div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={state.hasSheet}
                  onChange={(e) => onChange({ hasSheet: e.target.checked })}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="font-medium text-zinc-900">Chỉ BOM có sheet</span>
                  <span className="block text-xs text-zinc-500">
                    Ẩn BOM rỗng (chưa có linh kiện nào).
                  </span>
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    dateFrom: "",
                    dateTo: "",
                    minComponents: 0,
                    hasSheet: false,
                  })
                }
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
              >
                Đặt lại nâng cao
              </button>
              <span className="text-xs text-zinc-400 tabular-nums">
                {advancedCount} bộ lọc
              </span>
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort dropdown (native select, hợp với pattern V2 ở app này). */}
        <label className="relative inline-flex h-8 items-center">
          <span className="sr-only">Sắp xếp</span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as BomSortKey)}
            className="h-8 rounded-md border border-zinc-200 bg-white pl-7 pr-8 text-sm text-zinc-700 transition-colors hover:border-zinc-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.v} value={opt.v}>
                {opt.label}
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          >
            <SortIcon />
          </span>
          <span className="sr-only">{sortLabel}</span>
        </label>

        <div className="ml-auto flex items-center gap-3">
          {totalCount !== undefined && (
            <span className="text-sm text-zinc-500 tabular-nums">
              <span className="font-medium text-zinc-900">
                {totalCount.toLocaleString("vi-VN")}
              </span>{" "}
              BOM
            </span>
          )}
          {hasAnyFilter && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Xoá bộ lọc
            </button>
          )}

          {/* View toggle */}
          <div
            role="radiogroup"
            aria-label="Chế độ hiển thị"
            className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white p-0.5"
          >
            <button
              type="button"
              role="radio"
              aria-checked={view === "table"}
              aria-label="Hiển thị dạng bảng"
              onClick={() => onViewChange("table")}
              className={cn(
                "inline-flex h-7 w-8 items-center justify-center rounded-sm transition-colors",
                view === "table"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:text-zinc-900",
              )}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === "card"}
              aria-label="Hiển thị dạng thẻ"
              onClick={() => onViewChange("card")}
              className={cn(
                "inline-flex h-7 w-8 items-center justify-center rounded-sm transition-colors",
                view === "card"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:text-zinc-900",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 4l2-2 2 2M3 8l2 2 2-2M9 2v8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const initialBomFilterPlusState: BomFilterPlusState = {
  q: "",
  statuses: [],
  dateFrom: "",
  dateTo: "",
  minComponents: 0,
  hasSheet: false,
};
