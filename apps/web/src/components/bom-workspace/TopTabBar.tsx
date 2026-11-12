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
  /** Nội dung căn phải cùng hàng (vd avatar đang xem). */
  right?: React.ReactNode;
}

export function TopTabBar({ activeTab, onSelect, counts, right }: TopTabBarProps) {
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
      // V4.1 UI-BOM: bỏ `sticky top-0 z-20`. Tab bar nằm NGOÀI vùng cuộn của
      // lưới (flex-col shrink-0) nên không cần sticky; khi trang bị cuộn cả
      // tài liệu, sticky z-20 khiến thanh tab "trôi" đè lên các dòng lưới.
      // V4.1 UI-X6: ẩn thanh cuộn + nowrap để cuộn ngang gọn trên điện thoại.
      className="flex h-8 min-w-0 shrink-0 items-center gap-0.5 overflow-x-auto rounded-lg bg-zinc-100 p-0.5 [scrollbar-width:none] dark:bg-zinc-800 [&::-webkit-scrollbar]:hidden"
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
              "relative inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors duration-100",
              isActive
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            <span>{TOP_TAB_LABELS[key]}</span>
            {count !== undefined && count !== null && count > 0 && (
              <span
                className={cn(
                  "inline-flex whitespace-nowrap min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums font-semibold",
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
      {right ? <div className="ml-auto flex shrink-0 items-center pl-2">{right}</div> : null}
    </div>
  );
}
