"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  TOP_TAB_KEYS,
  TOP_TAB_LABELS,
  type TopTabKey,
} from "./useTopTabState";

export interface TopTabBarProps {
  activeTab: TopTabKey;
  onSelect: (tab: TopTabKey) => void;
  /** Badge count hiển thị bên cạnh tab (optional). */
  counts?: Partial<Record<TopTabKey, number>>;
}

/**
 * V2.0 P2 W6 — TASK-20260427-015.
 *
 * Top tab navigation cho BOM workspace. Sticky `top-0` ngay dưới topbar
 * (h-12) — z-20 để overlay table content khi cuộn dài.
 *
 * Style: cùng pattern BottomPanel cũ (border-b active, divider cột, count
 * badge), nhưng đặt ở top thay vì bottom.
 */
export function TopTabBar({ activeTab, onSelect, counts }: TopTabBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = TOP_TAB_KEYS[(idx + 1) % TOP_TAB_KEYS.length]!;
      onSelect(next);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev =
        TOP_TAB_KEYS[
          (idx - 1 + TOP_TAB_KEYS.length) % TOP_TAB_KEYS.length
        ]!;
      onSelect(prev);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="BOM workspace tabs"
      className="sticky top-0 z-20 flex h-9 shrink-0 items-center border-b border-zinc-200 bg-white pl-1 pr-2"
    >
      <div className="flex flex-1 items-center overflow-x-auto">
        {TOP_TAB_KEYS.map((key, idx) => {
          const isActive = activeTab === key;
          const count = counts?.[key];
          const showDivider = idx > 0;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(key)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={cn(
                "relative inline-flex h-9 shrink-0 items-center gap-1.5 px-3 text-xs transition-colors duration-100",
                showDivider && "border-l border-zinc-100",
                isActive
                  ? "border-b-2 border-indigo-500 bg-white font-semibold text-indigo-700"
                  : "border-b-2 border-transparent font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
              )}
            >
              <span>{TOP_TAB_LABELS[key]}</span>
              {count !== undefined && count !== null && (
                <span
                  className={cn(
                    "inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 font-mono text-[10px] tabular-nums",
                    isActive
                      ? "bg-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200"
                      : count > 0
                        ? "bg-zinc-200 text-zinc-700"
                        : "bg-transparent text-zinc-300",
                  )}
                >
                  {count > 0 ? count : "—"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
