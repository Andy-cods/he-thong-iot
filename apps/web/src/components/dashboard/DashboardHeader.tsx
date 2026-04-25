"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V3 DashboardHeader — title + last-updated + nút refresh manual.
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
        "flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-col">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Tổng quan
        </h1>
        <p className="text-sm text-zinc-500">
          Tiến độ tổng hợp các bộ phận · cập nhật mỗi 30 giây
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-500" aria-live="polite">
          {cachedAt ? `Cập nhật: ${formatRelative(cachedAt)}` : "Đang tải…"}
        </span>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors",
              "hover:border-zinc-300 hover:bg-zinc-50",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
            aria-label="Tải lại dữ liệu tổng quan"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                refreshing && "animate-spin",
              )}
              aria-hidden="true"
            />
            Tải lại
          </button>
        ) : null}
      </div>
    </header>
  );
}
