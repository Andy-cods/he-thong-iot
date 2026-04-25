"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * V3 ProgressBarCard — 1 trong 6 thanh tiến độ trên trang Tổng quan.
 *
 * Threshold màu (theo plans/redesign-v3/ui-redesign.md §B.4):
 *   - ≥80%  → emerald (xanh lá) — OK
 *   - 50-80% → amber (vàng) — warning
 *   - <50%  → red (đỏ) — critical
 *   - 0/0   → zinc (xám) — chưa có data
 *
 * Performance: memo bằng `React.memo` — chỉ re-render khi props đổi
 * (label, percent, numerator, denominator, drilldownHref).
 */

export interface ProgressBarCardProps {
  label: string;
  /** % 0-100, đã làm tròn 1 chữ số. */
  percent: number;
  numerator: number;
  denominator: number;
  /** Đơn vị hiển thị "X/Y". Default "linh kiện". */
  unitLabel?: string;
  /** Tooltip giải thích công thức tính. */
  tooltip?: string;
  icon?: LucideIcon;
  /** Click → navigate sang module gốc với filter pre-applied. */
  drilldownHref?: string;
  loading?: boolean;
  className?: string;
}

type Threshold = "ok" | "warn" | "crit" | "empty";

function classifyThreshold(percent: number, denominator: number): Threshold {
  if (denominator <= 0) return "empty";
  if (percent >= 80) return "ok";
  if (percent >= 50) return "warn";
  return "crit";
}

const fillColor: Record<Threshold, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  crit: "bg-red-500",
  empty: "bg-zinc-300",
};

const iconColor: Record<Threshold, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  crit: "text-red-600",
  empty: "text-zinc-400",
};

const percentTextColor: Record<Threshold, string> = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  crit: "text-red-700",
  empty: "text-zinc-500",
};

function formatNum(n: number): string {
  // Hiển thị tối đa 2 chữ số thập phân, bỏ trailing zero.
  if (Number.isInteger(n)) return n.toLocaleString("vi-VN");
  return n.toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function ProgressBarCardImpl({
  label,
  percent,
  numerator,
  denominator,
  unitLabel = "linh kiện",
  tooltip,
  icon: Icon,
  drilldownHref,
  loading,
  className,
}: ProgressBarCardProps) {
  if (loading) {
    return (
      <div
        aria-busy="true"
        className={cn(
          "flex h-[120px] flex-col gap-2 rounded-md border border-zinc-200 bg-white p-4",
          className,
        )}
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  const threshold = classifyThreshold(percent, denominator);
  const ariaLabel = `${label}: ${percent}%, ${formatNum(numerator)} trên ${formatNum(
    denominator,
  )} ${unitLabel}`;
  const interactive = Boolean(drilldownHref);

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {Icon ? (
            <Icon
              className={cn("h-3.5 w-3.5 shrink-0", iconColor[threshold])}
              aria-hidden="true"
              strokeWidth={2}
            />
          ) : null}
          <p className="truncate text-sm font-medium uppercase tracking-wide text-zinc-500">
            {label}
          </p>
        </div>
        {interactive ? (
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500"
            aria-hidden="true"
          />
        ) : null}
      </div>

      <p
        className={cn(
          "text-[1.75rem] font-semibold leading-none tabular-nums",
          percentTextColor[threshold],
        )}
        title={tooltip}
      >
        {threshold === "empty" ? (
          <span className="text-zinc-400">—</span>
        ) : (
          <>
            {percent.toLocaleString("vi-VN", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 1,
            })}
            <span className="ml-0.5 text-base font-medium text-zinc-500">%</span>
          </>
        )}
      </p>

      {/* Progress bar fill */}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-100"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${formatNum(numerator)} trên ${formatNum(
          denominator,
        )} ${unitLabel}`}
      >
        <div
          className={cn(
            "h-full transition-[width] duration-500 ease-out",
            fillColor[threshold],
          )}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>

      <p className="text-sm tabular-nums text-zinc-500">
        {threshold === "empty" ? (
          <span>Chưa có dữ liệu</span>
        ) : (
          <>
            <span className="font-medium text-zinc-700">
              {formatNum(numerator)}
            </span>
            <span className="mx-1 text-zinc-400">/</span>
            <span>{formatNum(denominator)}</span>
            <span className="ml-1">{unitLabel}</span>
          </>
        )}
      </p>
    </>
  );

  const baseClass = cn(
    "group flex h-[120px] flex-col justify-between gap-2 rounded-md border border-zinc-200 bg-white p-4",
    interactive &&
      "cursor-pointer transition-colors duration-150 ease-out hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
    className,
  );

  if (drilldownHref) {
    return (
      <Link
        href={drilldownHref}
        className={baseClass}
        aria-label={ariaLabel}
        title={tooltip}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={baseClass} aria-label={ariaLabel} title={tooltip}>
      {content}
    </div>
  );
}

export const ProgressBarCard = React.memo(ProgressBarCardImpl);
