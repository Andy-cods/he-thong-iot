"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { BOM_STATUS_LABELS } from "@iot/shared";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type BomStatusMode = "all" | "active" | "draft-obsolete";

export interface BomFilterBarState {
  q: string;
  statusMode: BomStatusMode;
}

export interface BomFilterBarProps {
  state: BomFilterBarState;
  onChange: (patch: Partial<BomFilterBarState>) => void;
  onReset: () => void;
  totalCount?: number;
  onSearchInput?: (v: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
}

/**
 * V2 BomFilterBar — compact theo pattern FilterBar.
 *
 * - Search 280px + segmented status 3-mode (Tất cả / Active / Draft-Obsolete).
 * - "Xoá bộ lọc" link khi có filter active.
 */
export function BomFilterBar({
  state,
  onChange,
  onReset,
  totalCount,
  onSearchInput,
  searchInputRef,
}: BomFilterBarProps) {
  const hasFilter = state.q.trim().length > 0 || state.statusMode !== "all";

  const segments: Array<{ v: BomStatusMode; label: string }> = [
    { v: "all", label: "Tất cả" },
    { v: "active", label: BOM_STATUS_LABELS.ACTIVE },
    { v: "draft-obsolete", label: "Nháp / Ngừng dùng" },
  ];

  return (
    <div className="border-b border-zinc-200 bg-white px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            ref={searchInputRef}
            type="search"
            size="sm"
            placeholder="Tìm mã BOM, tên..."
            className="h-8 w-full pl-7 md:w-[280px]"
            aria-label="Tìm kiếm BOM"
            value={state.q}
            onChange={(e) => {
              const v = e.target.value;
              if (onSearchInput) onSearchInput(v);
              else onChange({ q: v });
            }}
          />
        </div>

        <div
          role="radiogroup"
          aria-label="Lọc theo trạng thái"
          className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white p-0.5"
        >
          {segments.map((opt) => {
            const isActive = state.statusMode === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onChange({ statusMode: opt.v })}
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

        <div className="ml-auto flex items-center gap-3 text-sm text-zinc-500">
          {totalCount !== undefined && (
            <span className="tabular-nums">
              Tổng:{" "}
              <span className="font-medium text-zinc-900">
                {totalCount.toLocaleString("vi-VN")}
              </span>
            </span>
          )}
          {hasFilter && (
            <button
              type="button"
              onClick={onReset}
              className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              Xoá bộ lọc
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const initialBomFilterBarState: BomFilterBarState = {
  q: "",
  statusMode: "all",
};
