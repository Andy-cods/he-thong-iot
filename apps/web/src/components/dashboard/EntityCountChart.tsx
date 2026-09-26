"use client";

import * as React from "react";
import Link from "next/link";
import {
  Boxes,
  Building2,
  ClipboardList,
  Factory,
  FileText,
  Layers,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardCountsPayload } from "@/app/api/dashboard/counts/route";

/**
 * V3.5.1 — EntityCountChart compact.
 *
 * Pill stats hàng ngang gọn gàng. Mỗi pill: icon trong rounded-lg color +
 * label + value to + active count subtle. Click navigate.
 * Bỏ bar chart vì user feedback "nhìn xấu, design lại nhỏ gọn".
 */

const ICON_MAP: Record<string, LucideIcon> = {
  Layers,
  ClipboardList,
  FileText,
  ShoppingCart,
  Factory,
  Boxes,
  Building2,
};

export interface EntityCountChartProps {
  data: DashboardCountsPayload | null;
  loading?: boolean;
  className?: string;
}

export function EntityCountChart({ data, loading, className }: EntityCountChartProps) {
  const items = data?.chart ?? [];

  return (
    <section
      className={cn(
        "rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Số lượng dữ liệu hệ thống
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">cập nhật mỗi 30s</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Chưa có dữ liệu</p>
      ) : (
        // V4.1 UI-24 (X8, Đợt 6C): ô trung tính (bỏ 7 màu nền/icon/số); nhãn trên –
        // số dưới, nhãn không in hoa + truncate → hết cắt "LINH KIỆN 86" ở 390px.
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          {items.map((it) => {
            const Icon = ICON_MAP[it.iconName] ?? Layers;
            return (
              <Link
                key={it.key}
                href={it.href}
                className="group flex min-w-0 flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" strokeWidth={2.25} aria-hidden />
                  <span className="truncate text-xs font-medium text-zinc-500 dark:text-zinc-400" title={it.label}>
                    {it.label}
                  </span>
                </span>
                <span className="flex items-baseline gap-1">
                  <span className="text-lg font-semibold leading-none tabular-nums text-zinc-900 dark:text-zinc-50">
                    {it.total.toLocaleString("vi-VN")}
                  </span>
                  {it.active !== it.total && it.total > 0 && (
                    <span
                      className="truncate text-xs tabular-nums text-zinc-500 dark:text-zinc-400"
                      title={`${it.active} đang hoạt động`}
                    >
                      / {it.active}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
