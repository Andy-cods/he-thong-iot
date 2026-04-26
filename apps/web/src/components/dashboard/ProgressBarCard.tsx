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
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    iconBg: "bg-emerald-100",
    iconText: "text-emerald-700",
    value: "text-emerald-900",
    barFrom: "from-emerald-400",
    barTo: "to-emerald-600",
    barTrack: "bg-emerald-100",
    hoverBorder: "hover:border-emerald-300",
    cta: "text-emerald-700 hover:text-emerald-800",
  },
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-100",
    iconBg: "bg-blue-100",
    iconText: "text-blue-700",
    value: "text-blue-900",
    barFrom: "from-blue-400",
    barTo: "to-blue-600",
    barTrack: "bg-blue-100",
    hoverBorder: "hover:border-blue-300",
    cta: "text-blue-700 hover:text-blue-800",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-100",
    iconBg: "bg-amber-100",
    iconText: "text-amber-700",
    value: "text-amber-900",
    barFrom: "from-amber-400",
    barTo: "to-amber-600",
    barTrack: "bg-amber-100",
    hoverBorder: "hover:border-amber-300",
    cta: "text-amber-700 hover:text-amber-800",
  },
  indigo: {
    bg: "bg-indigo-50",
    border: "border-indigo-100",
    iconBg: "bg-indigo-100",
    iconText: "text-indigo-700",
    value: "text-indigo-900",
    barFrom: "from-indigo-400",
    barTo: "to-indigo-600",
    barTrack: "bg-indigo-100",
    hoverBorder: "hover:border-indigo-300",
    cta: "text-indigo-700 hover:text-indigo-800",
  },
  rose: {
    bg: "bg-rose-50",
    border: "border-rose-100",
    iconBg: "bg-rose-100",
    iconText: "text-rose-700",
    value: "text-rose-900",
    barFrom: "from-rose-400",
    barTo: "to-rose-600",
    barTrack: "bg-rose-100",
    hoverBorder: "hover:border-rose-300",
    cta: "text-rose-700 hover:text-rose-800",
  },
  violet: {
    bg: "bg-violet-50",
    border: "border-violet-100",
    iconBg: "bg-violet-100",
    iconText: "text-violet-700",
    value: "text-violet-900",
    barFrom: "from-violet-400",
    barTo: "to-violet-600",
    barTrack: "bg-violet-100",
    hoverBorder: "hover:border-violet-300",
    cta: "text-violet-700 hover:text-violet-800",
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
          "flex h-[160px] flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5",
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
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-600">
            {label}
          </p>
        </div>
        {interactive ? (
          <ArrowUpRight
            className="h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-700"
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
        <span className="text-base font-medium text-zinc-500">%</span>
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

      <p className="text-sm tabular-nums text-zinc-600">
        <span className="font-semibold text-zinc-800">
          {formatNum(numerator)}
        </span>
        <span className="mx-1 text-zinc-400">/</span>
        <span>{formatNum(denominator)}</span>
        <span className="ml-1 text-zinc-500">{unitLabel}</span>
      </p>
    </>
  );

  // ---- Card empty (chưa có dữ liệu) ----
  const emptyContent = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-100">
              <Icon
                className="h-4 w-4 text-zinc-400"
                aria-hidden="true"
                strokeWidth={2}
              />
            </span>
          ) : null}
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {label}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-2xl font-semibold leading-none tabular-nums text-zinc-300">
          —
        </p>
        <p className="text-sm text-zinc-500">Chưa có dữ liệu</p>
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
          "border-dashed border-zinc-200 bg-white",
          interactive &&
            "cursor-pointer hover:border-zinc-300 hover:bg-zinc-50/60 hover:shadow-sm",
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
