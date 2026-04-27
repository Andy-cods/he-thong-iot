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
  counts?: Partial<Record<TopTabKey, number>>;
}

export function TopTabBar({ activeTab, onSelect, counts }: TopTabBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onSelect(TOP_TAB_KEYS[(idx + 1) % TOP_TAB_KEYS.length]!);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSelect(TOP_TAB_KEYS[(idx - 1 + TOP_TAB_KEYS.length) % TOP_TAB_KEYS.length]!);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="BOM workspace tabs"
      className="sticky top-0 z-20 flex h-11 shrink-0 items-center gap-0.5 border-b border-zinc-200 bg-white px-3"
    >
      {TOP_TAB_KEYS.map((key, idx) => {
        const isActive = activeTab === key;
        const count = counts?.[key];
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
              "relative inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors duration-100",
              "after:absolute after:bottom-[-9px] after:left-0 after:right-0 after:h-0.5 after:rounded-t-full after:transition-all",
              isActive
                ? "bg-indigo-50 text-indigo-700 after:bg-indigo-600"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 after:bg-transparent",
            )}
          >
            <span>{TOP_TAB_LABELS[key]}</span>
            {count !== undefined && count !== null && (
              <span
                className={cn(
                  "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs tabular-nums font-semibold",
                  isActive
                    ? "bg-indigo-600 text-white"
                    : count > 0
                      ? "bg-zinc-200 text-zinc-700"
                      : "text-zinc-300",
                )}
              >
                {count > 0 ? count : "—"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
