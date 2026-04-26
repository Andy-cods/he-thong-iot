"use client";

import * as React from "react";
import { RefreshCw, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V3.1 DashboardHeader — Hero section trang Tổng quan.
 *
 * Redesign rationale (TASK-20260427-010):
 *   - Hero section với background gradient subtle (zinc → indigo-50/40),
 *     icon gauge, headline lớn + subline + last-update + nút Tải lại.
 *   - Layout responsive: stack mobile, row desktop.
 *
 * Format last-updated:
 *   - <60s: "vừa xong"
 *   - <60min: "x phút trước"
 *   - <24h: "x giờ trước"
 *   - khác: "dd/MM/yyyy HH:mm"
 */

export interface DashboardHeaderProps {
  cachedAt?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
}

function formatRelative(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "—";
    const diffSec = Math.floor((Date.now() - t) / 1000);
    if (diffSec < 0) return "vừa xong";
    if (diffSec < 60) return "vừa xong";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function DashboardHeader({
  cachedAt,
  onRefresh,
  refreshing,
  className,
}: DashboardHeaderProps) {
  // Tự re-render mỗi 30s để format relative chính xác.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!cachedAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [cachedAt]);

  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-xl border border-zinc-200 bg-gradient-to-br from-white via-white to-indigo-50/60 px-5 py-5 shadow-xs sm:px-6 sm:py-6",
        className,
      )}
    >
      {/* Decorative ring — subtle, không lấn nội dung */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-100/60 to-transparent blur-2xl"
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200"
          >
            <Activity className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-[1.625rem]">
              Tổng quan vận hành
            </h1>
            <p className="text-sm text-zinc-600">
              Tiến độ tổng hợp các bộ phận · cập nhật mỗi 30 giây
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-sm text-zinc-600 ring-1 ring-inset ring-zinc-200"
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                cachedAt
                  ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]"
                  : "bg-zinc-300",
              )}
            />
            {cachedAt ? `Cập nhật: ${formatRelative(cachedAt)}` : "Đang tải…"}
          </span>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-xs transition-colors",
                "hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
              aria-label="Tải lại dữ liệu tổng quan"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
                aria-hidden="true"
              />
              Tải lại
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
