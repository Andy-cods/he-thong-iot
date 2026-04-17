"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Direction B — KpiCard (design-spec §3.13).
 *
 * - Visual: border-l 4px theo status (success/warning/danger/info/neutral).
 * - Value 36px font-bold tabular-nums.
 * - Delta optional: arrow up/down/flat + màu theo direction.
 * - Clickable variant: wrap <Link>, hover border-slate-300.
 * - Loading: skeleton 112px height (tương đương content height).
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
  /** Icon node — truyền `<Package className="h-5 w-5" />` từ RSC để tránh serialize function. */
  icon?: React.ReactNode;
  /** Href → render <Link>, bỏ qua onClick. */
  href?: string;
  onClick?: () => void;
  loading?: boolean;
  className?: string;
}

const statusBorder: Record<KpiStatus, string> = {
  success: "border-l-success",
  warning: "border-l-warning",
  danger: "border-l-danger",
  info: "border-l-info",
  neutral: "border-l-slate-300",
};

const deltaColor: Record<KpiDelta["direction"], string> = {
  up: "text-success-strong",
  down: "text-danger-strong",
  flat: "text-slate-500",
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
          "flex min-h-28 flex-col gap-2 rounded-md border border-slate-200 bg-white p-4",
          className,
        )}
      >
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  const DeltaIcon = delta ? deltaIcon[delta.direction] : null;
  const isInteractive = Boolean(href || onClick);

  const ariaLabel = buildAriaLabel(label, value, delta);

  const content = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {icon ? (
          <span className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-heading text-4xl font-bold tabular-nums text-slate-900">
        {value}
      </p>
      {delta ? (
        <p
          className={cn(
            "mt-1 flex items-center gap-1 font-mono text-sm",
            deltaColor[delta.direction],
          )}
        >
          {DeltaIcon ? (
            <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
          ) : null}
          <span className="tabular-nums">
            {delta.direction === "flat" ? "±0" : formatDelta(delta.value)}
          </span>
          {delta.label ? (
            <span className="text-slate-500">{delta.label}</span>
          ) : null}
        </p>
      ) : null}
    </>
  );

  const baseClass = cn(
    "flex min-h-28 flex-col rounded-md border border-slate-200 bg-white p-4 border-l-4",
    status ? statusBorder[status] : "border-l-slate-200",
    isInteractive &&
      "transition-fast hover:border-slate-300 hover:shadow-sm focus:outline-none focus-visible:shadow-focus",
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
