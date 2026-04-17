"use client";

import * as React from "react";
import { ChevronDown, Filter, Search, X } from "lucide-react";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  type ItemType,
  type Uom,
} from "@iot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FilterBarState {
  q: string;
  type: ItemType[];
  uom: Uom[];
  active: boolean | null;
  tracking: "lot" | "serial" | "none" | null;
  category: string;
  supplierId: string;
  minStockViolation: boolean;
}

export interface FilterBarProps {
  state: FilterBarState;
  onChange: (patch: Partial<FilterBarState>) => void;
  onReset: () => void;
  totalCount?: number;
  onSearchInput?: (v: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
}

/**
 * V2 FilterBar — Linear-inspired compact (design-spec §2.4, impl-plan §8.T7).
 *
 * Layout chính:
 * - Row 1: Search (h-8 w-[280px]) + Type multi (h-8) + Active segmented (h-8)
 *          + Advanced Popover (h-8) + Xoá tất cả (ml-auto text-xs blue-600).
 * - Row 2 (conditional): Active filter chips inline dismiss icon 12px.
 *
 * Font 13px, padding-y 8px, border-b zinc-200. Badge "Tìm không dấu" show khi
 * NEXT_PUBLIC_FEATURE_UNACCENT=true (brainstorm-deep §5.1 + D25).
 *
 * Giữ URL-state nuqs: parent tự truyền state + onChange, không quản state riêng.
 */
export function FilterBar({
  state,
  onChange,
  onReset,
  totalCount,
  onSearchInput,
  searchInputRef,
}: FilterBarProps) {
  const unaccentEnabled =
    process.env.NEXT_PUBLIC_FEATURE_UNACCENT === "true";

  const activeCount = countActiveFilters(state);
  const advCount = advancedCount(state);
  const activeMode: "all" | "active" | "inactive" =
    state.active === null ? "all" : state.active ? "active" : "inactive";

  const chips = buildFilterChips(state);

  return (
    <div className="border-b border-zinc-200 bg-white px-4 py-2">
      {/* Row 1 — primary controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search — 280px icon leading 14px */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            ref={searchInputRef}
            type="search"
            size="sm"
            placeholder="Tìm SKU, tên..."
            className="h-8 w-full pl-7 md:w-[280px]"
            aria-label="Tìm kiếm vật tư"
            value={state.q}
            onChange={(e) => {
              const v = e.target.value;
              if (onSearchInput) onSearchInput(v);
              else onChange({ q: v });
            }}
          />
        </div>

        {unaccentEnabled && (
          <Badge variant="info" size="sm" className="shrink-0">
            Tìm không dấu
          </Badge>
        )}

        {/* Type multi-select Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 border border-zinc-200"
              aria-label="Lọc theo loại"
            >
              <span>Loại</span>
              {state.type.length > 0 && (
                <span className="rounded-sm bg-blue-50 px-1 text-xs font-medium text-blue-700">
                  {state.type.length}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-2" align="start">
            <ul className="space-y-0.5 text-base">
              {ITEM_TYPES.map((t) => {
                const checked = state.type.includes(t);
                return (
                  <li key={t}>
                    <label className="flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 hover:bg-zinc-50">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = v === true
                            ? [...state.type, t]
                            : state.type.filter((x) => x !== t);
                          onChange({ type: next });
                        }}
                        aria-label={ITEM_TYPE_LABELS[t]}
                      />
                      <span className="text-zinc-900">
                        {ITEM_TYPE_LABELS[t]}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {state.type.length > 0 && (
              <button
                type="button"
                onClick={() => onChange({ type: [] })}
                className="mt-2 w-full rounded-sm px-2 py-1 text-left text-sm text-blue-600 hover:bg-zinc-50"
              >
                Xoá lựa chọn loại
              </button>
            )}
          </PopoverContent>
        </Popover>

        {/* Active segmented control — 3 mode */}
        <div
          role="radiogroup"
          aria-label="Lọc theo trạng thái"
          className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white p-0.5"
        >
          {(
            [
              { v: "all", label: "Tất cả", val: null },
              { v: "active", label: "Đang dùng", val: true },
              { v: "inactive", label: "Ngừng", val: false },
            ] as const
          ).map((opt) => {
            const isActive = activeMode === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onChange({ active: opt.val })}
                className={cn(
                  "inline-flex h-7 items-center rounded-sm px-2.5 text-base font-medium transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-0",
                  isActive
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:text-zinc-900",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Advanced filter Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 border border-zinc-200"
              aria-label="Mở bộ lọc nâng cao"
            >
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Nâng cao</span>
              {advCount > 0 && (
                <span className="rounded-sm bg-blue-50 px-1 text-xs font-medium text-blue-700">
                  {advCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-4" align="start">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="filter-category" uppercase>
                  Danh mục
                </Label>
                <Input
                  id="filter-category"
                  size="sm"
                  placeholder="VD: Thép tấm"
                  value={state.category}
                  onChange={(e) => onChange({ category: e.target.value })}
                />
              </div>

              <div className="col-span-2 space-y-1">
                <Label htmlFor="filter-supplier" uppercase>
                  Nhà cung cấp
                </Label>
                <Input
                  id="filter-supplier"
                  size="sm"
                  placeholder="ID NCC"
                  value={state.supplierId}
                  onChange={(e) => onChange({ supplierId: e.target.value })}
                />
              </div>

              <div className="col-span-2 space-y-1">
                <Label htmlFor="filter-tracking" uppercase>
                  Chế độ theo dõi
                </Label>
                <Select
                  value={state.tracking ?? "all"}
                  onValueChange={(v) =>
                    onChange({
                      tracking:
                        v === "all"
                          ? null
                          : (v as "lot" | "serial" | "none"),
                    })
                  }
                >
                  <SelectTrigger id="filter-tracking" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="lot">Theo lô</SelectItem>
                    <SelectItem value="serial">Theo serial</SelectItem>
                    <SelectItem value="none">Không theo dõi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="col-span-2 flex items-start gap-2 pt-1">
                <Checkbox
                  checked={state.minStockViolation}
                  onCheckedChange={(v) =>
                    onChange({ minStockViolation: v === true })
                  }
                  aria-label="Chỉ vật tư dưới min-stock"
                  className="mt-0.5"
                />
                <span className="text-base text-zinc-700">
                  Chỉ vật tư dưới min-stock
                </span>
              </label>
            </div>
          </PopoverContent>
        </Popover>

        {/* Right-side meta */}
        <div className="ml-auto flex items-center gap-3 text-sm text-zinc-500">
          {totalCount !== undefined && (
            <span className="tabular-nums">
              Tổng:{" "}
              <span className="font-medium text-zinc-900">
                {totalCount.toLocaleString("vi-VN")}
              </span>
            </span>
          )}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              aria-label="Xoá tất cả bộ lọc"
            >
              Xoá tất cả
            </button>
          )}
        </div>
      </div>

      {/* Row 2 — active filter chips */}
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => chip.onRemove(onChange)}
              className="inline-flex h-6 items-center gap-1 rounded-sm border border-zinc-200 bg-zinc-50 px-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-0"
              aria-label={`Xoá bộ lọc: ${chip.label}`}
            >
              <span>{chip.label}</span>
              <X className="h-3 w-3 text-zinc-500" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function countActiveFilters(s: FilterBarState): number {
  let n = 0;
  if (s.q.trim()) n++;
  if (s.type.length > 0) n++;
  if (s.uom.length > 0) n++;
  if (s.active !== null) n++;
  if (s.tracking) n++;
  if (s.category.trim()) n++;
  if (s.supplierId) n++;
  if (s.minStockViolation) n++;
  return n;
}

function advancedCount(s: FilterBarState): number {
  let n = 0;
  if (s.tracking) n++;
  if (s.category.trim()) n++;
  if (s.supplierId) n++;
  if (s.minStockViolation) n++;
  return n;
}

interface FilterChip {
  key: string;
  label: string;
  onRemove: (onChange: (patch: Partial<FilterBarState>) => void) => void;
}

function buildFilterChips(state: FilterBarState): FilterChip[] {
  const chips: FilterChip[] = [];
  state.type.forEach((t) => {
    chips.push({
      key: `type-${t}`,
      label: `Loại: ${ITEM_TYPE_LABELS[t]}`,
      onRemove: (onChange) =>
        onChange({ type: state.type.filter((x) => x !== t) }),
    });
  });
  if (state.tracking) {
    const label =
      state.tracking === "lot"
        ? "Theo lô"
        : state.tracking === "serial"
          ? "Theo serial"
          : "Không theo dõi";
    chips.push({
      key: "tracking",
      label: `Tracking: ${label}`,
      onRemove: (onChange) => onChange({ tracking: null }),
    });
  }
  if (state.category.trim()) {
    chips.push({
      key: "category",
      label: `Danh mục: ${state.category}`,
      onRemove: (onChange) => onChange({ category: "" }),
    });
  }
  if (state.supplierId) {
    chips.push({
      key: "supplier",
      label: `NCC: ${state.supplierId}`,
      onRemove: (onChange) => onChange({ supplierId: "" }),
    });
  }
  if (state.minStockViolation) {
    chips.push({
      key: "minstock",
      label: "Dưới min-stock",
      onRemove: (onChange) => onChange({ minStockViolation: false }),
    });
  }
  return chips;
}

export const initialFilterBarState: FilterBarState = {
  q: "",
  type: [],
  uom: [],
  active: true,
  tracking: null,
  category: "",
  supplierId: "",
  minStockViolation: false,
};
