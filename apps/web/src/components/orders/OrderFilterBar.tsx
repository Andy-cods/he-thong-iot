"use client";

import * as React from "react";
import { Search } from "lucide-react";
import {
  SALES_ORDER_STATUS_LABELS,
  type SalesOrderStatus,
} from "@iot/shared";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type OrderStatusMode =
  | "all"
  | "DRAFT"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "CLOSED";

export interface OrderFilterBarState {
  q: string;
  statusMode: OrderStatusMode;
  dateFrom: string;
  dateTo: string;
}

export interface OrderFilterBarProps {
  state: OrderFilterBarState;
  onChange: (patch: Partial<OrderFilterBarState>) => void;
  onReset: () => void;
  totalCount?: number;
  onSearchInput?: (v: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
}

const STATUS_SEGMENTS: Array<{ v: OrderStatusMode; label: string }> = [
  { v: "all", label: "Tất cả" },
  { v: "DRAFT", label: SALES_ORDER_STATUS_LABELS.DRAFT },
  { v: "CONFIRMED", label: SALES_ORDER_STATUS_LABELS.CONFIRMED },
  { v: "IN_PROGRESS", label: SALES_ORDER_STATUS_LABELS.IN_PROGRESS },
  { v: "CLOSED", label: SALES_ORDER_STATUS_LABELS.CLOSED },
];

export function orderStatusFromMode(
  mode: OrderStatusMode,
): SalesOrderStatus[] | undefined {
  if (mode === "all") return undefined;
  return [mode];
}

/**
 * V2 OrderFilterBar — pattern BomFilterBar.
 * Search 280px + segmented status 5-mode + date range (from/to).
 */
export function OrderFilterBar({
  state,
  onChange,
  onReset,
  totalCount,
  onSearchInput,
  searchInputRef,
}: OrderFilterBarProps) {
  const hasFilter =
    state.q.trim().length > 0 ||
    state.statusMode !== "all" ||
    state.dateFrom !== "" ||
    state.dateTo !== "";

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
            placeholder="Tìm mã đơn, khách hàng..."
            className="h-8 w-full pl-7 md:w-[280px]"
            aria-label="Tìm kiếm đơn hàng"
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
          {STATUS_SEGMENTS.map((opt) => {
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

        <div className="flex items-center gap-1.5 text-sm text-zinc-500">
          <span className="text-xs uppercase tracking-wide">Deadline:</span>
          <Input
            type="date"
            size="sm"
            className="h-8 w-[140px] tabular-nums"
            aria-label="Từ ngày"
            value={state.dateFrom}
            onChange={(e) => onChange({ dateFrom: e.target.value })}
          />
          <span className="text-zinc-400">→</span>
          <Input
            type="date"
            size="sm"
            className="h-8 w-[140px] tabular-nums"
            aria-label="Đến ngày"
            value={state.dateTo}
            onChange={(e) => onChange({ dateTo: e.target.value })}
          />
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

export const initialOrderFilterBarState: OrderFilterBarState = {
  q: "",
  statusMode: "all",
  dateFrom: "",
  dateTo: "",
};
