"use client";

import * as React from "react";
import { Filter, Search, X } from "lucide-react";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  UOMS,
  UOM_LABELS,
  type ItemType,
  type Uom,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
 * FilterBar — URL-state driven (nuqs) (design-spec §2.4).
 *
 * Layout:
 * - Search full-width mobile / 320 desktop (debounce ở page layer).
 * - 3 select chính: Loại / UoM / Trạng thái.
 * - Advanced Popover cho tracking / min-stock / supplier.
 * - Badge "N bộ lọc đang áp dụng" + "Xoá tất cả".
 *
 * Hint "Tìm tiếng Việt không dấu" chỉ render khi FEATURE_UNACCENT=true
 * (brainstorm-deep §5.1 + D25 — mặc định false tới khi migration 0002 apply).
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

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
      <div className="relative w-full md:w-80">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <Input
          ref={searchInputRef}
          type="search"
          placeholder="Tìm SKU / tên / barcode…"
          className="pl-7"
          aria-label="Tìm kiếm vật tư"
          value={state.q}
          onChange={(e) => {
            const v = e.target.value;
            if (onSearchInput) onSearchInput(v);
            else onChange({ q: v });
          }}
        />
      </div>

      <Select
        value={state.type[0] ?? "all"}
        onValueChange={(v) =>
          onChange({ type: v === "all" ? [] : [v as ItemType] })
        }
      >
        <SelectTrigger className="w-44" aria-label="Lọc theo loại">
          <SelectValue placeholder="Loại" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả loại</SelectItem>
          {ITEM_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {ITEM_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={state.uom[0] ?? "all"}
        onValueChange={(v) =>
          onChange({ uom: v === "all" ? [] : [v as Uom] })
        }
      >
        <SelectTrigger className="w-40" aria-label="Lọc theo đơn vị">
          <SelectValue placeholder="UoM" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả UoM</SelectItem>
          {UOMS.map((u) => (
            <SelectItem key={u} value={u}>
              {u} — {UOM_LABELS[u]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={
          state.active === null ? "all" : state.active ? "true" : "false"
        }
        onValueChange={(v) =>
          onChange({ active: v === "all" ? null : v === "true" })
        }
      >
        <SelectTrigger className="w-40" aria-label="Lọc theo trạng thái">
          <SelectValue placeholder="Trạng thái" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả trạng thái</SelectItem>
          <SelectItem value="true">Đang dùng</SelectItem>
          <SelectItem value="false">Đã xoá</SelectItem>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" aria-label="Mở bộ lọc nâng cao">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Nâng cao
            {advancedCount(state) > 0 && (
              <span className="ml-1 rounded-full bg-info-soft px-1.5 text-xs font-medium text-info-strong">
                {advancedCount(state)}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3" align="start">
          <div className="space-y-1">
            <label
              htmlFor="filter-tracking"
              className="text-xs font-medium text-slate-700"
            >
              Chế độ theo dõi
            </label>
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
              <SelectTrigger id="filter-tracking">
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

          <div className="space-y-1">
            <label
              htmlFor="filter-category"
              className="text-xs font-medium text-slate-700"
            >
              Nhóm / category
            </label>
            <Input
              id="filter-category"
              placeholder="VD: Thép tấm"
              value={state.category}
              onChange={(e) => onChange({ category: e.target.value })}
            />
          </div>

          <label className="flex items-center gap-2 pt-1">
            <Checkbox
              checked={state.minStockViolation}
              onCheckedChange={(v) =>
                onChange({ minStockViolation: v === true })
              }
              aria-label="Chỉ vật tư dưới min-stock"
            />
            <span className="text-sm text-slate-700">
              Chỉ vật tư dưới min-stock
            </span>
          </label>
        </PopoverContent>
      </Popover>

      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          aria-label="Xoá tất cả bộ lọc"
          className="text-slate-600"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Xoá lọc ({activeCount})
        </Button>
      )}

      <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
        {unaccentEnabled && (
          <span className="hidden text-xs text-slate-400 md:inline">
            Tìm tiếng Việt không dấu
          </span>
        )}
        {totalCount !== undefined && (
          <span>
            Tổng:{" "}
            <span className="font-semibold text-slate-900 tabular-nums">
              {totalCount}
            </span>
          </span>
        )}
      </div>
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

