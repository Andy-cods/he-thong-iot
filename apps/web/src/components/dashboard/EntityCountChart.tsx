"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
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
 * V3.5 — EntityCountChart.
 *
 * Bar chart cột nhỏ hiển thị số lượng entities (BOM, Đơn hàng, PR, PO, WO,
 * Linh kiện, NCC). Mỗi cột có height theo total relative + label số lượng
 * + active count subtle. Click cột → navigate sang module.
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

const COLOR_BAR: Record<string, string> = {
  indigo:  "from-indigo-400 to-indigo-600 group-hover:from-indigo-500 group-hover:to-indigo-700",
  blue:    "from-blue-400 to-blue-600 group-hover:from-blue-500 group-hover:to-blue-700",
  violet:  "from-violet-400 to-violet-600 group-hover:from-violet-500 group-hover:to-violet-700",
  amber:   "from-amber-400 to-amber-600 group-hover:from-amber-500 group-hover:to-amber-700",
  rose:    "from-rose-400 to-rose-600 group-hover:from-rose-500 group-hover:to-rose-700",
  emerald: "from-emerald-400 to-emerald-600 group-hover:from-emerald-500 group-hover:to-emerald-700",
  cyan:    "from-cyan-400 to-cyan-600 group-hover:from-cyan-500 group-hover:to-cyan-700",
};

const COLOR_TEXT: Record<string, string> = {
  indigo:  "text-indigo-700",
  blue:    "text-blue-700",
  violet:  "text-violet-700",
  amber:   "text-amber-700",
  rose:    "text-rose-700",
  emerald: "text-emerald-700",
  cyan:    "text-cyan-700",
};

const COLOR_GLOW: Record<string, string> = {
  indigo:  "bg-indigo-200/40",
  blue:    "bg-blue-200/40",
  violet:  "bg-violet-200/40",
  amber:   "bg-amber-200/40",
  rose:    "bg-rose-200/40",
  emerald: "bg-emerald-200/40",
  cyan:    "bg-cyan-200/40",
};

export interface EntityCountChartProps {
  data: DashboardCountsPayload | null;
  loading?: boolean;
  className?: string;
}

export function EntityCountChart({ data, loading, className }: EntityCountChartProps) {
  const items = data?.chart ?? [];
  const maxTotal = Math.max(1, ...items.map((i) => i.total));

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/30">
          <BarChart3 className="h-5 w-5 text-white" strokeWidth={2.25} />
        </div>
        <div>
          <h2 className="text-base font-bold text-zinc-900">Tổng quan dữ liệu hệ thống</h2>
          <p className="text-xs text-zinc-500">Số lượng entities trong DB · cập nhật mỗi 30s</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">Chưa có dữ liệu</p>
      ) : (
        <div className="flex items-end gap-2 sm:gap-3">
          {items.map((it) => {
            const Icon = ICON_MAP[it.iconName] ?? BarChart3;
            const heightPct = it.total > 0 ? Math.max(8, (it.total / maxTotal) * 100) : 4;
            const barCls = COLOR_BAR[it.color] ?? COLOR_BAR.indigo!;
            const textCls = COLOR_TEXT[it.color] ?? COLOR_TEXT.indigo!;
            const glowCls = COLOR_GLOW[it.color] ?? COLOR_GLOW.indigo!;

            return (
              <Link
                key={it.key}
                href={it.href}
                className="group flex flex-1 flex-col items-center gap-2.5 transition-transform hover:-translate-y-0.5"
              >
                {/* Number above bar */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className={cn("text-2xl font-bold tabular-nums leading-none", textCls)}>
                    {it.total.toLocaleString("vi-VN")}
                  </span>
                  {it.active !== it.total && it.total > 0 && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                      {it.active} active
                    </span>
                  )}
                </div>

                {/* Bar */}
                <div className="relative flex h-32 w-full items-end justify-center">
                  {/* Glow effect on hover */}
                  <div
                    className={cn(
                      "absolute inset-x-1 bottom-0 rounded-2xl opacity-0 blur-xl transition-opacity group-hover:opacity-100",
                      glowCls,
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                  <div
                    className={cn(
                      "relative w-full rounded-t-xl bg-gradient-to-t shadow-sm transition-all duration-500",
                      barCls,
                    )}
                    style={{ height: `${heightPct}%` }}
                  >
                    {/* Top icon */}
                    <span className="absolute inset-x-0 top-2 flex justify-center">
                      <Icon className="h-4 w-4 text-white drop-shadow-sm" strokeWidth={2.5} />
                    </span>
                  </div>
                </div>

                {/* Label */}
                <div className="flex items-center gap-0.5">
                  <span className="text-xs font-semibold text-zinc-700 group-hover:text-zinc-900">
                    {it.label}
                  </span>
                  <ArrowUpRight className="h-3 w-3 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
