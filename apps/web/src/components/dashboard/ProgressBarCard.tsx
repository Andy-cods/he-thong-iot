"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * V3.1 ProgressBarCard — 1 trong 6 thanh tiến độ trên trang Tổng quan.
 *
 * Redesign rationale (TASK-20260427-010):
 *   - Hierarchy mạnh: card có data (denominator > 0) nổi bật với background
 *     màu nhạt theo `tone` (semantic-driven, KHÔNG threshold-driven), value
 *     `text-3xl` bold, progress bar gradient.
 *   - Card empty (denominator = 0): nhẹ hơn, value mờ, không progress bar,
 *     thay "Chưa có dữ liệu" gạch xám bằng CTA "Vào [module]" (link subtle)
 *     để biến slot trống thành lối vào module.
 *   - Click toàn bộ card → drilldown URL (Link wrap), KHÔNG chỉ chevron.
 *   - Hover: scale-[1.01] + shadow-md transition.
 *
 * Color semantics (`tone`): emerald/blue/amber/indigo/rose/violet — gắn cứng
 * theo từng metric, KHÔNG đổi theo % giá trị (tránh nhiễu visual).
 */

export type ProgressTone =
  | "emerald"
  | "blue"
  | "amber"
  | "indigo"
  | "rose"
  | "violet";

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
  /** Color tone — gắn cứng theo từng metric (semantic-driven). */
  tone: ProgressTone;
  /** Tên module hiển thị trong CTA empty state ("Vào [module]"). */
  moduleLabel: string;
  /** Click → navigate sang module gốc với filter pre-applied. */
  drilldownHref?: string;
  loading?: boolean;
  className?: string;
}

interface ToneStyles {
  bg: string; // background card có data
  border: string; // border card có data
  iconBg: string; // chip nền icon
  iconText: string; // màu icon
  value: string; // màu số %
  barFrom: string; // gradient bar — from
  barTo: string; // gradient bar — to
  barTrack: string; // background track progress
  hoverBorder: string; // border hover
  cta: string; // màu CTA empty state
}

const TONE: Record<ProgressTone, ToneStyles> = {
  emerald: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-100 dark:border-emerald-900/60",
    iconBg: "bg-emerald-100 dark:bg-emerald-950/60",
    iconText: "text-emerald-700 dark:text-emerald-300",
    value: "text-emerald-900 dark:text-emerald-200",
    barFrom: "from-emerald-400",
    barTo: "to-emerald-600",
    barTrack: "bg-emerald-100 dark:bg-emerald-950/60",
    hoverBorder: "hover:border-emerald-300 dark:hover:border-emerald-700",
    cta: "text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-100 dark:border-blue-900/60",
    iconBg: "bg-blue-100 dark:bg-blue-950/60",
    iconText: "text-blue-700 dark:text-blue-300",
    value: "text-blue-900 dark:text-blue-200",
    barFrom: "from-blue-400",
    barTo: "to-blue-600",
    barTrack: "bg-blue-100 dark:bg-blue-950/60",
    hoverBorder: "hover:border-blue-300 dark:hover:border-blue-700",
    cta: "text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-100 dark:border-amber-900/60",
    iconBg: "bg-amber-100 dark:bg-amber-950/60",
    iconText: "text-amber-700 dark:text-amber-300",
    value: "text-amber-900 dark:text-amber-200",
    barFrom: "from-amber-400",
    barTo: "to-amber-600",
    barTrack: "bg-amber-100 dark:bg-amber-950/60",
    hoverBorder: "hover:border-amber-300 dark:hover:border-amber-700",
    cta: "text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300",
  },
  indigo: {
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
    border: "border-indigo-100 dark:border-indigo-900/60",
    iconBg: "bg-indigo-100 dark:bg-indigo-950/60",
    iconText: "text-indigo-700 dark:text-indigo-300",
    value: "text-indigo-900 dark:text-indigo-200",
    barFrom: "from-indigo-400",
    barTo: "to-indigo-600",
    barTrack: "bg-indigo-100 dark:bg-indigo-950/60",
    hoverBorder: "hover:border-indigo-300 dark:hover:border-indigo-700",
    cta: "text-indigo-700 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300",
  },
  rose: {
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-100 dark:border-rose-900/60",
    iconBg: "bg-rose-100 dark:bg-rose-950/60",
    iconText: "text-rose-700 dark:text-rose-300",
    value: "text-rose-900 dark:text-rose-200",
    barFrom: "from-rose-400",
    barTo: "to-rose-600",
    barTrack: "bg-rose-100 dark:bg-rose-950/60",
    hoverBorder: "hover:border-rose-300 dark:hover:border-rose-700",
    cta: "text-rose-700 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300",
  },
  violet: {
    bg: "bg-violet-50 dark:bg-violet-950/40",
    border: "border-violet-100 dark:border-violet-900/60",
    iconBg: "bg-violet-100 dark:bg-violet-950/60",
    iconText: "text-violet-700 dark:text-violet-300",
    value: "text-violet-900 dark:text-violet-200",
    barFrom: "from-violet-400",
    barTo: "to-violet-600",
    barTrack: "bg-violet-100 dark:bg-violet-950/60",
    hoverBorder: "hover:border-violet-300 dark:hover:border-violet-700",
    cta: "text-violet-700 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-300",
  },
};

function formatNum(n: number): string {
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
  tone,
  moduleLabel,
  drilldownHref,
  loading,
  className,
}: ProgressBarCardProps) {
  if (loading) {
    return (
      <div
        aria-busy="true"
        className={cn(
          "flex h-[160px] flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900",
          className,
        )}
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  const isEmpty = denominator <= 0;
  const styles = TONE[tone];
  const ariaLabel = isEmpty
    ? `${label}: chưa có dữ liệu. Mở module ${moduleLabel}.`
    : `${label}: ${percent}%, ${formatNum(numerator)} trên ${formatNum(
        denominator,
      )} ${unitLabel}`;
  const interactive = Boolean(drilldownHref);

  // ---- Card có data ----
  const dataContent = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <span
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                styles.iconBg,
              )}
            >
              <Icon
                className={cn("h-4 w-4", styles.iconText)}
                aria-hidden="true"
                strokeWidth={2}
              />
            </span>
          ) : null}
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            {label}
          </p>
        </div>
        {interactive ? (
          <ArrowUpRight
            className="h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-200"
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div className="flex items-baseline gap-1.5">
        <p
          className={cn(
            "text-3xl font-bold leading-none tabular-nums",
            styles.value,
          )}
          title={tooltip}
        >
          {percent.toLocaleString("vi-VN", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 1,
          })}
        </p>
        <span className="text-base font-medium text-zinc-500 dark:text-zinc-400">%</span>
      </div>

      {/* Progress bar fill — gradient nhẹ */}
      <div
        className={cn(
          "h-2 w-full overflow-hidden rounded-full",
          styles.barTrack,
        )}
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
            "h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out",
            styles.barFrom,
            styles.barTo,
          )}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>

      <p className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
          {formatNum(numerator)}
        </span>
        <span className="mx-1 text-zinc-400 dark:text-zinc-500">/</span>
        <span>{formatNum(denominator)}</span>
        <span className="ml-1 text-zinc-500 dark:text-zinc-400">{unitLabel}</span>
      </p>
    </>
  );

  // ---- Card empty (chưa có dữ liệu) ----
  const emptyContent = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
              <Icon
                className="h-4 w-4 text-zinc-400 dark:text-zinc-500"
                aria-hidden="true"
                strokeWidth={2}
              />
            </span>
          ) : null}
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {label}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-2xl font-semibold leading-none tabular-nums text-zinc-300 dark:text-zinc-600">
          —
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Chưa có dữ liệu</p>
      </div>

      {interactive ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-sm font-medium transition-colors",
            styles.cta,
          )}
        >
          Vào {moduleLabel}
          <ArrowUpRight
            className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      ) : null}
    </>
  );

  // ---- Container styles ----
  const baseClass = cn(
    "group flex h-[160px] flex-col justify-between gap-3 rounded-lg border p-5",
    "transition-all duration-200 ease-out",
    isEmpty
      ? cn(
          "border-dashed border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900",
          interactive &&
            "cursor-pointer hover:border-zinc-300 hover:bg-zinc-50/60 hover:shadow-sm dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60",
        )
      : cn(
          styles.border,
          styles.bg,
          interactive &&
            cn(
              "cursor-pointer",
              styles.hoverBorder,
              "hover:scale-[1.01] hover:shadow-md",
            ),
        ),
    interactive &&
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
    className,
  );

  const content = isEmpty ? emptyContent : dataContent;

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
