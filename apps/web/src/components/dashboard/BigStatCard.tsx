"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
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

/**
 * V4.1 UI-24 (X8, Đợt 6C): bỏ 6 bộ màu gradient + quầng sáng. Mọi thẻ dùng
 * CHUNG 1 kiểu trung tính (trắng, viền zinc, số đen, icon zinc); màu duy nhất
 * là thanh tiến độ indigo (thương hiệu). `tone` giữ trong props để không vỡ
 * call-site nhưng không còn đổi màu.
 */
const NEUTRAL: ToneConfig = {
  cardBg: "bg-white dark:bg-zinc-900",
  cardBorder: "border-zinc-200 dark:border-zinc-800",
  iconBg: "bg-zinc-100 dark:bg-zinc-800",
  iconText: "text-zinc-500 dark:text-zinc-400",
  valueColor: "text-zinc-900 dark:text-zinc-50",
  barTrack: "bg-zinc-100 dark:bg-zinc-800",
  barFill: "bg-indigo-500",
  subText: "text-zinc-500 dark:text-zinc-400",
  hoverBorder: "hover:border-zinc-300 dark:hover:border-zinc-700",
  glow: "",
};
const TONE: Record<BigStatTone, ToneConfig> = {
  emerald: NEUTRAL,
  blue: NEUTRAL,
  amber: NEUTRAL,
  indigo: NEUTRAL,
  rose: NEUTRAL,
  violet: NEUTRAL,
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

// V4.4 (A3) — dùng `formatNumber` (lib/format.ts) thay toLocaleString cục bộ;
// `maximumFractionDigits: 1` tự nhiên bỏ ".0" thừa cho số nguyên, không cần
// nhánh `Number.isInteger` riêng.
function formatValue(n: number): string {
  return formatNumber(n, undefined, { maximumFractionDigits: 1 });
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
      <div className={cn("flex min-h-[176px] flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900", className)}>
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
          "group relative flex min-h-[176px] flex-col justify-between rounded-lg border border-dashed border-zinc-200 bg-white p-6 transition-all hover:border-zinc-300 hover:bg-zinc-50/40 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/40",
          className,
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
            <Icon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" strokeWidth={2} />
          </span>
          <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
        </div>

        <div>
          <p className="text-base font-medium text-zinc-400 dark:text-zinc-500">Chưa có dữ liệu</p>
          <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
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
        "group relative flex min-h-[176px] flex-col justify-between overflow-hidden rounded-lg border p-5 transition-colors duration-150",
        styles.cardBg,
        styles.cardBorder,
        styles.hoverBorder,
        className,
      )}
    >
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg", styles.iconBg)}>
            <Icon className={cn("h-5 w-5", styles.iconText)} strokeWidth={2.25} />
          </span>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{label}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 text-zinc-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:text-zinc-600 dark:group-hover:text-zinc-200" />
      </div>

      <div className="relative flex flex-col gap-3">
        {/* Big value */}
        <div className="flex items-baseline gap-1">
          <span className={cn("text-4xl font-semibold leading-none tracking-tight tabular-nums", styles.valueColor)}>
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
