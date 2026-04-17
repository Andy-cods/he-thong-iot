"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * V2 KpiCard — Linear-inspired compact (design-spec §2.2 + §3.3.1).
 *
 * Delta V1: BỎ border-l-4 stripe, height 112→80, padding 24→16,
 * value 36 bold → 22 medium, label 14→12 uppercase.
 *
 * **RSC boundary fix**: `icon` nhận `React.ReactNode` (JSX element) — không phải
 * `React.ElementType` (function) vì function không thể serialize qua RSC→Client
 * boundary. Caller truyền `<Icon className="h-3.5 w-3.5" />`.
 *
 * Status dot 6px bên trái label khi có status (chỉ visual hint, không còn
 * color stripe bìa trái như V1).
 */

export type KpiStatus = "success" | "warning" | "danger" | "info" | "neutral";

export interface KpiDelta {
  value: number;
  direction: "up" | "down" | "flat";
  label?: string;
}

export interface KpiCardProps {
  label: string;
  value: number | string;
  delta?: KpiDelta;
  status?: KpiStatus;
  /** JSX element (e.g. `<Package className="h-3.5 w-3.5" />`) — an toàn qua RSC boundary. */
  icon?: React.ReactNode;
  /** Href → render <Link>, bỏ qua onClick. */
  href?: string;
  onClick?: () => void;
  loading?: boolean;
  className?: string;
}

const statusDot: Record<KpiStatus, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
  neutral: "bg-zinc-300",
};

const deltaColor: Record<KpiDelta["direction"], string> = {
  up: "text-emerald-600",
  down: "text-red-600",
  flat: "text-zinc-500",
};

const deltaIcon: Record<KpiDelta["direction"], React.ElementType> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: ArrowRight,
};

export function KpiCard({
  label,
  value,
  delta,
  status,
  icon,
  href,
  onClick,
  loading,
  className,
}: KpiCardProps) {
  if (loading) {
    return (
      <div
        aria-busy="true"
        className={cn(
          "flex h-20 flex-col justify-between rounded-md border border-zinc-200 bg-white p-4",
          className,
        )}
      >
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  const DeltaIcon = delta ? deltaIcon[delta.direction] : null;
  const isInteractive = Boolean(href || onClick);

  const ariaLabel = buildAriaLabel(label, value, delta);

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {status ? (
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                statusDot[status],
              )}
            />
          ) : null}
          <p className="truncate text-sm font-medium uppercase tracking-wide text-zinc-500">
            {label}
          </p>
        </div>
        {icon ? (
          <span className="shrink-0 text-zinc-400" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="text-[1.375rem] font-medium leading-none tabular-nums text-zinc-900">
        {value}
      </p>
      {delta ? (
        <p
          className={cn(
            "flex items-center gap-1 text-sm",
            deltaColor[delta.direction],
          )}
        >
          {DeltaIcon ? (
            <DeltaIcon className="h-3 w-3" aria-hidden="true" />
          ) : null}
          <span className="font-mono tabular-nums">
            {delta.direction === "flat" ? "±0" : formatDelta(delta.value)}
          </span>
          {delta.label ? (
            <span className="truncate text-zinc-500">{delta.label}</span>
          ) : null}
        </p>
      ) : null}
    </>
  );

  const baseClass = cn(
    "flex h-20 flex-col justify-between rounded-md border border-zinc-200 bg-white p-4",
    isInteractive &&
      "transition-colors duration-150 ease-out hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={baseClass} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(baseClass, "text-left")}
        aria-label={ariaLabel}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={baseClass} aria-label={ariaLabel}>
      {content}
    </div>
  );
}

function formatDelta(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}`;
}

function buildAriaLabel(
  label: string,
  value: number | string,
  delta?: KpiDelta,
): string {
  let result = `${label}: ${value}`;
  if (delta) {
    const dir =
      delta.direction === "up"
        ? "tăng"
        : delta.direction === "down"
          ? "giảm"
          : "không đổi";
    result += `, ${dir} ${Math.abs(delta.value)}`;
    if (delta.label) result += ` ${delta.label}`;
  }
  return result;
}
