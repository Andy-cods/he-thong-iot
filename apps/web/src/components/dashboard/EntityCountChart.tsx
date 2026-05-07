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

const COLOR_PILL: Record<string, { bg: string; iconBg: string; iconText: string; valueText: string }> = {
  indigo:  { bg: "hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30",   iconBg: "bg-indigo-100 dark:bg-indigo-950/60",   iconText: "text-indigo-700 dark:text-indigo-300",   valueText: "text-indigo-700 dark:text-indigo-300"   },
  blue:    { bg: "hover:bg-blue-50/60 dark:hover:bg-blue-950/30",       iconBg: "bg-blue-100 dark:bg-blue-950/60",       iconText: "text-blue-700 dark:text-blue-300",       valueText: "text-blue-700 dark:text-blue-300"       },
  violet:  { bg: "hover:bg-violet-50/60 dark:hover:bg-violet-950/30",   iconBg: "bg-violet-100 dark:bg-violet-950/60",   iconText: "text-violet-700 dark:text-violet-300",   valueText: "text-violet-700 dark:text-violet-300"   },
  amber:   { bg: "hover:bg-amber-50/60 dark:hover:bg-amber-950/30",     iconBg: "bg-amber-100 dark:bg-amber-950/60",     iconText: "text-amber-700 dark:text-amber-300",     valueText: "text-amber-700 dark:text-amber-300"     },
  rose:    { bg: "hover:bg-rose-50/60 dark:hover:bg-rose-950/30",       iconBg: "bg-rose-100 dark:bg-rose-950/60",       iconText: "text-rose-700 dark:text-rose-300",       valueText: "text-rose-700 dark:text-rose-300"       },
  emerald: { bg: "hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30", iconBg: "bg-emerald-100 dark:bg-emerald-950/60", iconText: "text-emerald-700 dark:text-emerald-300", valueText: "text-emerald-700 dark:text-emerald-300" },
  cyan:    { bg: "hover:bg-cyan-50/60 dark:hover:bg-cyan-950/30",       iconBg: "bg-cyan-100 dark:bg-cyan-950/60",       iconText: "text-cyan-700 dark:text-cyan-300",       valueText: "text-cyan-700 dark:text-cyan-300"       },
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
        "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Số lượng dữ liệu hệ thống
        </p>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">cập nhật mỗi 30s</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Chưa có dữ liệu</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {items.map((it) => {
            const Icon = ICON_MAP[it.iconName] ?? Layers;
            const cls = COLOR_PILL[it.color] ?? COLOR_PILL.indigo!;
            return (
              <Link
                key={it.key}
                href={it.href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl border border-zinc-100 bg-white px-3 py-2.5 transition-all hover:border-zinc-200 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700",
                  cls.bg,
                )}
              >
                <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", cls.iconBg)}>
                  <Icon className={cn("h-4 w-4", cls.iconText)} strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {it.label}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className={cn("text-lg font-bold leading-none tabular-nums", cls.valueText)}>
                      {it.total.toLocaleString("vi-VN")}
                    </span>
                    {it.active !== it.total && it.total > 0 && (
                      <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                        / {it.active}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
