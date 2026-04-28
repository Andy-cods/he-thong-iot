"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * V3.5 — BigStatCard.
 *
 * Card lớn với percentage/number đậm style giống "Sản xuất nội bộ" mặc định.
 * Có data → hiển thị value to (text-5xl), thanh progress dày, sub label
 * subtitle bên dưới.
 * Empty → CTA "Vào module" với background subtle.
 */

export type BigStatTone = "indigo" | "blue" | "amber" | "rose" | "violet" | "emerald";

interface ToneConfig {
  cardBg: string;
  cardBorder: string;
  iconBg: string;
  iconText: string;
  valueColor: string;
  barTrack: string;
  barFill: string;
  subText: string;
  hoverBorder: string;
  glow: string;
}

const TONE: Record<BigStatTone, ToneConfig> = {
  emerald: {
    cardBg: "bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/40",
    cardBorder: "border-emerald-100",
    iconBg: "bg-emerald-100",
    iconText: "text-emerald-700",
    valueColor: "text-emerald-700",
    barTrack: "bg-emerald-100/70",
    barFill: "bg-gradient-to-r from-emerald-400 to-emerald-600",
    subText: "text-emerald-700/80",
    hoverBorder: "hover:border-emerald-300",
    glow: "bg-emerald-200/30",
  },
  blue: {
    cardBg: "bg-gradient-to-br from-blue-50/80 via-white to-blue-50/40",
    cardBorder: "border-blue-100",
    iconBg: "bg-blue-100",
    iconText: "text-blue-700",
    valueColor: "text-blue-700",
    barTrack: "bg-blue-100/70",
    barFill: "bg-gradient-to-r from-blue-400 to-blue-600",
    subText: "text-blue-700/80",
    hoverBorder: "hover:border-blue-300",
    glow: "bg-blue-200/30",
  },
  amber: {
    cardBg: "bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40",
    cardBorder: "border-amber-100",
    iconBg: "bg-amber-100",
    iconText: "text-amber-700",
    valueColor: "text-amber-700",
    barTrack: "bg-amber-100/70",
    barFill: "bg-gradient-to-r from-amber-400 to-orange-500",
    subText: "text-amber-700/80",
    hoverBorder: "hover:border-amber-300",
    glow: "bg-amber-200/30",
  },
  indigo: {
    cardBg: "bg-gradient-to-br from-indigo-50/80 via-white to-indigo-50/40",
    cardBorder: "border-indigo-100",
    iconBg: "bg-indigo-100",
    iconText: "text-indigo-700",
    valueColor: "text-indigo-700",
    barTrack: "bg-indigo-100/70",
    barFill: "bg-gradient-to-r from-indigo-400 to-indigo-600",
    subText: "text-indigo-700/80",
    hoverBorder: "hover:border-indigo-300",
    glow: "bg-indigo-200/30",
  },
  rose: {
    cardBg: "bg-gradient-to-br from-rose-50/80 via-white to-rose-50/40",
    cardBorder: "border-rose-100",
    iconBg: "bg-rose-100",
    iconText: "text-rose-700",
    valueColor: "text-rose-700",
    barTrack: "bg-rose-100/70",
    barFill: "bg-gradient-to-r from-rose-400 to-rose-600",
    subText: "text-rose-700/80",
    hoverBorder: "hover:border-rose-300",
    glow: "bg-rose-200/30",
  },
  violet: {
    cardBg: "bg-gradient-to-br from-violet-50/80 via-white to-violet-50/40",
    cardBorder: "border-violet-100",
    iconBg: "bg-violet-100",
    iconText: "text-violet-700",
    valueColor: "text-violet-700",
    barTrack: "bg-violet-100/70",
    barFill: "bg-gradient-to-r from-violet-400 to-violet-600",
    subText: "text-violet-700/80",
    hoverBorder: "hover:border-violet-300",
    glow: "bg-violet-200/30",
  },
};

export interface BigStatCardProps {
  /** Title above value. */
  label: string;
  /** Main value displayed (vd "16,7" hoặc "21,1"). */
  value: number;
  /** Suffix sau value (vd "%"). */
  valueSuffix?: string;
  /** Sub label dưới progress bar (vd "1 / 6 lệnh"). */
  subText?: string;
  /** Module name in CTA empty state. */
  moduleLabel: string;
  /** Click → navigate to module. */
  href: string;
  /** Icon. */
  icon: LucideIcon;
  /** Color tone — gắn cứng theo metric. */
  tone: BigStatTone;
  /** Numerator/denominator để render progress bar. */
  numerator?: number;
  denominator?: number;
  /** % để render bar (override numerator/denominator nếu có). */
  percent?: number;
  loading?: boolean;
  className?: string;
  /** Hidden when no data → render compact placeholder. */
  alwaysShowValue?: boolean;
}

function formatValue(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString("vi-VN");
  return n.toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function BigStatCard({
  label,
  value,
  valueSuffix,
  subText,
  moduleLabel,
  href,
  icon: Icon,
  tone,
  numerator,
  denominator,
  percent,
  loading,
  className,
  alwaysShowValue = false,
}: BigStatCardProps) {
  if (loading) {
    return (
      <div className={cn("flex h-[200px] flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-6", className)}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-12 w-24" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  const styles = TONE[tone];
  const hasData = (denominator ?? 0) > 0 || alwaysShowValue || value > 0;
  const computedPct = percent !== undefined
    ? percent
    : denominator && denominator > 0
      ? Math.min(100, ((numerator ?? 0) / denominator) * 100)
      : 0;

  if (!hasData) {
    return (
      <Link
        href={href}
        className={cn(
          "group relative flex h-[200px] flex-col justify-between rounded-3xl border-2 border-dashed border-zinc-200 bg-white p-6 transition-all hover:border-zinc-300 hover:bg-zinc-50/40 hover:shadow-sm",
          className,
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
            <Icon className="h-5 w-5 text-zinc-400" strokeWidth={2} />
          </span>
          <p className="text-sm font-bold uppercase tracking-wider text-zinc-500">{label}</p>
        </div>

        <div>
          <p className="text-base font-medium text-zinc-400">Chưa có dữ liệu</p>
          <p className={cn("mt-2 inline-flex items-center gap-1 text-sm font-semibold", styles.valueColor)}>
            Vào {moduleLabel}
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-[200px] flex-col justify-between overflow-hidden rounded-3xl border p-6 shadow-sm transition-all duration-200",
        "hover:scale-[1.01] hover:shadow-lg",
        styles.cardBg,
        styles.cardBorder,
        styles.hoverBorder,
        className,
      )}
    >
      {/* Glow blob */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-2xl opacity-50 transition-opacity group-hover:opacity-80",
          styles.glow,
        )}
      />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl shadow-sm", styles.iconBg)}>
            <Icon className={cn("h-5 w-5", styles.iconText)} strokeWidth={2.25} />
          </span>
          <p className="text-sm font-bold uppercase tracking-wider text-zinc-700">{label}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 text-zinc-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-700" />
      </div>

      <div className="relative flex flex-col gap-3">
        {/* Big value */}
        <div className="flex items-baseline gap-1">
          <span className={cn("text-5xl font-bold leading-none tracking-tight tabular-nums", styles.valueColor)}>
            {formatValue(value)}
          </span>
          {valueSuffix && (
            <span className={cn("text-xl font-semibold", styles.valueColor)}>{valueSuffix}</span>
          )}
        </div>

        {/* Progress bar */}
        {(percent !== undefined || (denominator !== undefined && denominator > 0)) && (
          <div className={cn("h-2 w-full overflow-hidden rounded-full", styles.barTrack)}>
            <div
              className={cn("h-full rounded-full transition-[width] duration-700 ease-out", styles.barFill)}
              style={{ width: `${Math.max(0, Math.min(100, computedPct))}%` }}
            />
          </div>
        )}

        {subText && (
          <p className={cn("text-sm font-medium", styles.subText)}>{subText}</p>
        )}
      </div>
    </Link>
  );
}
