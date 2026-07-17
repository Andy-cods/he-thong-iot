"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline, type SparklineDatum } from "./Sparkline";

/**
 * V3.2 MetricCard — bento-friendly replacement của ProgressBarCard
 * (TASK-20260427-027).
 *
 * Khác ProgressBarCard:
 *  - Glass layer (`bg-white/70 backdrop-blur-sm`) + gradient blob hông phải.
 *  - Variant `default` | `large` (large dùng cho card 2x2 — show sparkline).
 *  - Stagger fade-in: prop `index` → animation-delay (CSS variable).
 *  - Hover: scale-[1.01] + shadow nâng + border glow.
 *  - Number lớn 4xl (default) / 5xl (large).
 *
 * KHÔNG đổi data shape. Drop-in cho ProgressBarStack.
 */

export type MetricTone =
  | "emerald"
  | "blue"
  | "amber"
  | "indigo"
  | "rose"
  | "violet";

export interface MetricCardProps {
  label: string;
  /** % 0-100. */
  percent: number;
  numerator: number;
  denominator: number;
  unitLabel?: string;
  tooltip?: string;
  icon?: LucideIcon;
  tone: MetricTone;
  moduleLabel: string;
  drilldownHref?: string;
  loading?: boolean;
  /** 0-based index — drive stagger animation delay. */
  index?: number;
  variant?: "default" | "large";
  /** Optional sparkline data — chỉ render nếu variant='large'. */
  sparkline?: SparklineDatum[];
  /** Optional sub-label cho large variant ("Lệnh đang chạy: 12"). */
  subStat?: { label: string; value: string };
  className?: string;
}

interface ToneStyles {
  // Layered glass background
  glow: string; // gradient blob màu hông trên-phải
  borderRest: string;
  borderHover: string;
  iconBg: string;
  iconText: string;
  value: string;
  barFrom: string;
  barTo: string;
  barTrack: string;
  cta: string;
  ringHover: string;
  sparkTone: "rose" | "emerald" | "indigo";
}

const TONE: Record<MetricTone, ToneStyles> = {
  emerald: {
    glow: "from-emerald-200/60 via-emerald-100/30 to-transparent dark:from-emerald-800/30 dark:via-emerald-900/20",
    borderRest: "border-emerald-100/60 dark:border-emerald-900/60",
    borderHover: "hover:border-emerald-300/80 dark:hover:border-emerald-700/80",
    iconBg: "bg-emerald-100/80 ring-1 ring-emerald-200/70 dark:bg-emerald-950/60 dark:ring-emerald-800/70",
    iconText: "text-emerald-700 dark:text-emerald-300",
    value: "text-emerald-900 dark:text-emerald-200",
    barFrom: "from-emerald-400",
    barTo: "to-emerald-600",
    barTrack: "bg-emerald-100/70 dark:bg-emerald-950/60",
    cta: "text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300",
    ringHover: "hover:ring-1 hover:ring-emerald-200/80 dark:hover:ring-emerald-800/80",
    sparkTone: "emerald",
  },
  blue: {
    glow: "from-blue-200/60 via-blue-100/30 to-transparent dark:from-blue-800/30 dark:via-blue-900/20",
    borderRest: "border-blue-100/60 dark:border-blue-900/60",
    borderHover: "hover:border-blue-300/80 dark:hover:border-blue-700/80",
    iconBg: "bg-blue-100/80 ring-1 ring-blue-200/70 dark:bg-blue-950/60 dark:ring-blue-800/70",
    iconText: "text-blue-700 dark:text-blue-300",
    value: "text-blue-900 dark:text-blue-200",
    barFrom: "from-blue-400",
    barTo: "to-blue-600",
    barTrack: "bg-blue-100/70 dark:bg-blue-950/60",
    cta: "text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300",
    ringHover: "hover:ring-1 hover:ring-blue-200/80 dark:hover:ring-blue-800/80",
    sparkTone: "indigo",
  },
  amber: {
    glow: "from-amber-200/70 via-amber-100/40 to-transparent dark:from-amber-800/30 dark:via-amber-900/20",
    borderRest: "border-amber-100/60 dark:border-amber-900/60",
    borderHover: "hover:border-amber-300/80 dark:hover:border-amber-700/80",
    iconBg: "bg-amber-100/80 ring-1 ring-amber-200/70 dark:bg-amber-950/60 dark:ring-amber-800/70",
    iconText: "text-amber-700 dark:text-amber-300",
    value: "text-amber-900 dark:text-amber-200",
    barFrom: "from-amber-400",
    barTo: "to-amber-600",
    barTrack: "bg-amber-100/70 dark:bg-amber-950/60",
    cta: "text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300",
    ringHover: "hover:ring-1 hover:ring-amber-200/80 dark:hover:ring-amber-800/80",
    sparkTone: "rose",
  },
  indigo: {
    glow: "from-indigo-200/60 via-indigo-100/30 to-transparent dark:from-indigo-800/30 dark:via-indigo-900/20",
    borderRest: "border-indigo-100/60 dark:border-indigo-900/60",
    borderHover: "hover:border-indigo-300/80 dark:hover:border-indigo-700/80",
    iconBg: "bg-indigo-100/80 ring-1 ring-indigo-200/70 dark:bg-indigo-950/60 dark:ring-indigo-800/70",
    iconText: "text-indigo-700 dark:text-indigo-300",
    value: "text-indigo-900 dark:text-indigo-200",
    barFrom: "from-indigo-400",
    barTo: "to-indigo-600",
    barTrack: "bg-indigo-100/70 dark:bg-indigo-950/60",
    cta: "text-indigo-700 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300",
    ringHover: "hover:ring-1 hover:ring-indigo-200/80 dark:hover:ring-indigo-800/80",
    sparkTone: "indigo",
  },
  rose: {
    glow: "from-rose-200/70 via-rose-100/30 to-transparent dark:from-rose-800/30 dark:via-rose-900/20",
    borderRest: "border-rose-100/60 dark:border-rose-900/60",
    borderHover: "hover:border-rose-300/80 dark:hover:border-rose-700/80",
    iconBg: "bg-rose-100/80 ring-1 ring-rose-200/70 dark:bg-rose-950/60 dark:ring-rose-800/70",
    iconText: "text-rose-700 dark:text-rose-300",
    value: "text-rose-900 dark:text-rose-200",
    barFrom: "from-rose-400",
    barTo: "to-rose-600",
    barTrack: "bg-rose-100/70 dark:bg-rose-950/60",
    cta: "text-rose-700 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300",
    ringHover: "hover:ring-1 hover:ring-rose-200/80 dark:hover:ring-rose-800/80",
    sparkTone: "rose",
  },
  violet: {
    glow: "from-violet-200/60 via-violet-100/30 to-transparent dark:from-violet-800/30 dark:via-violet-900/20",
    borderRest: "border-violet-100/60 dark:border-violet-900/60",
    borderHover: "hover:border-violet-300/80 dark:hover:border-violet-700/80",
    iconBg: "bg-violet-100/80 ring-1 ring-violet-200/70 dark:bg-violet-950/60 dark:ring-violet-800/70",
    iconText: "text-violet-700 dark:text-violet-300",
    value: "text-violet-900 dark:text-violet-200",
    barFrom: "from-violet-400",
    barTo: "to-violet-600",
    barTrack: "bg-violet-100/70 dark:bg-violet-950/60",
    cta: "text-violet-700 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-300",
    ringHover: "hover:ring-1 hover:ring-violet-200/80 dark:hover:ring-violet-800/80",
    sparkTone: "indigo",
  },
};

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString("vi-VN");
  return n.toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * useCountUp — animation count-up cho percent (0 → target trong ~700ms).
 * Tôn trọng prefers-reduced-motion (skip animation, set ngay giá trị).
 */
function useCountUp(target: number, durationMs = 700) {
  const [v, setV] = React.useState<number>(0);
  React.useEffect(() => {
    if (typeof window === "undefined") {
      setV(target);
      return;
    }
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced || durationMs <= 0) {
      setV(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutQuart
      const e = 1 - Math.pow(1 - t, 4);
      setV(from + (target - from) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return v;
}

function MetricCardImpl({
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
  index = 0,
  variant = "default",
  sparkline,
  subStat,
  className,
}: MetricCardProps) {
  const isLarge = variant === "large";
  const styles = TONE[tone];
  const animatedPercent = useCountUp(percent);

  if (loading) {
    return (
      <div
        aria-busy="true"
        className={cn(
          "flex flex-col gap-3 rounded-2xl border border-zinc-200/70 bg-white/60 p-5 backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-900/60",
          isLarge ? "min-h-[280px]" : "min-h-[160px]",
          className,
        )}
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className={cn(isLarge ? "h-12 w-32" : "h-9 w-20")} />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-32" />
        {isLarge ? <Skeleton className="mt-auto h-14 w-full" /> : null}
      </div>
    );
  }

  const isEmpty = denominator <= 0;
  const interactive = Boolean(drilldownHref);
  const ariaLabel = isEmpty
    ? `${label}: chưa có dữ liệu. Mở module ${moduleLabel}.`
    : `${label}: ${percent}%, ${formatNum(numerator)} trên ${formatNum(
        denominator,
      )} ${unitLabel}`;

  // ---- Card có data ----
  const dataContent = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-lg",
                styles.iconBg,
                isLarge ? "h-9 w-9" : "h-8 w-8",
              )}
            >
              <Icon
                className={cn(
                  isLarge ? "h-5 w-5" : "h-4 w-4",
                  styles.iconText,
                )}
                aria-hidden="true"
                strokeWidth={2}
              />
            </span>
          ) : null}
          <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">
            {label}
          </p>
        </div>
        {interactive ? (
          <ArrowUpRight
            className="h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-200"
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div className="flex items-baseline gap-1.5">
        <p
          className={cn(
            "font-bold leading-none tabular-nums tracking-tight",
            styles.value,
            isLarge ? "text-5xl" : "text-4xl",
          )}
          title={tooltip}
        >
          {animatedPercent.toLocaleString("vi-VN", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 1,
          })}
        </p>
        <span
          className={cn(
            "font-semibold text-zinc-500 dark:text-zinc-400",
            isLarge ? "text-2xl" : "text-xl",
          )}
        >
          %
        </span>
      </div>

      {/* Progress bar fill — gradient */}
      <div
        className={cn(
          "h-1.5 w-full overflow-hidden rounded-full",
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
            "h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out",
            styles.barFrom,
            styles.barTo,
          )}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>

      <p
        className={cn(
          "tabular-nums text-zinc-600 dark:text-zinc-400",
          isLarge ? "text-sm" : "text-[12.5px]",
        )}
      >
        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
          {formatNum(numerator)}
        </span>
        <span className="mx-1 text-zinc-400 dark:text-zinc-500">/</span>
        <span>{formatNum(denominator)}</span>
        <span className="ml-1 text-zinc-500 dark:text-zinc-400">{unitLabel}</span>
      </p>

      {isLarge ? (
        <div className="mt-auto flex flex-col gap-2 pt-2">
          {subStat ? (
            <div className="flex items-baseline justify-between gap-2 rounded-lg bg-white/60 px-3 py-1.5 ring-1 ring-inset ring-zinc-200/60 dark:bg-zinc-800/60 dark:ring-zinc-700/60">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {subStat.label}
              </span>
              <span className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                {subStat.value}
              </span>
            </div>
          ) : null}
          {sparkline && sparkline.length > 0 ? (
            <div>
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                7 ngày qua
              </p>
              <Sparkline data={sparkline} tone={styles.sparkTone} />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  // ---- Card empty ----
  const emptyContent = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-100/80 ring-1 ring-zinc-200/60 dark:bg-zinc-800/80 dark:ring-zinc-700/60",
                isLarge ? "h-9 w-9" : "h-8 w-8",
              )}
            >
              <Icon
                className={cn(
                  isLarge ? "h-5 w-5" : "h-4 w-4",
                  "text-zinc-400 dark:text-zinc-500",
                )}
                aria-hidden="true"
                strokeWidth={2}
              />
            </span>
          ) : null}
          <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            {label}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p
          className={cn(
            "font-semibold leading-none tabular-nums text-zinc-300 dark:text-zinc-600",
            isLarge ? "text-4xl" : "text-3xl",
          )}
        >
          —
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Chưa có dữ liệu</p>
      </div>

      {interactive ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-sm font-medium transition-colors mt-auto",
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

  // ---- Container styles (glass card) ----
  const baseClass = cn(
    "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-white/70 p-5 backdrop-blur-sm dark:bg-zinc-900/60",
    "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]",
    "transition-all duration-300 ease-out",
    "dashboard-stagger-fade",
    isLarge ? "min-h-[280px]" : "min-h-[160px]",
    isEmpty
      ? cn(
          "border-dashed border-zinc-200 bg-white/60 dark:border-zinc-700 dark:bg-zinc-900/60",
          interactive &&
            "cursor-pointer hover:border-zinc-300 hover:bg-zinc-50/70 hover:shadow-md dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60",
        )
      : cn(
          styles.borderRest,
          interactive &&
            cn(
              "cursor-pointer",
              styles.borderHover,
              styles.ringHover,
              "hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.08)]",
            ),
        ),
    interactive &&
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
    className,
  );

  const inlineStyle: React.CSSProperties = {
    ["--stagger-delay" as never]: `${Math.min(index, 12) * 60}ms`,
  };

  const decoration = isEmpty ? null : (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br blur-2xl",
        styles.glow,
      )}
    />
  );

  const content = (
    <>
      {decoration}
      <div className="relative flex flex-1 flex-col gap-3">
        {isEmpty ? emptyContent : dataContent}
      </div>
    </>
  );

  if (drilldownHref) {
    return (
      <Link
        href={drilldownHref}
        className={baseClass}
        aria-label={ariaLabel}
        title={tooltip}
        style={inlineStyle}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={baseClass}
      aria-label={ariaLabel}
      title={tooltip}
      style={inlineStyle}
    >
      {content}
    </div>
  );
}

export const MetricCard = React.memo(MetricCardImpl);
