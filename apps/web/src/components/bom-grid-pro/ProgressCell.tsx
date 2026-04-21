"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  Factory,
  MinusCircle,
  Package,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V1.7-beta.2 — Progress cell với 5 states đồng bộ với MaterialStatus
 * (apps/web/src/server/services/derivedStatus.ts V1.5):
 *   NO_ORDERS / PLANNED / PURCHASING / PARTIAL / AVAILABLE / ISSUED
 *
 * Thêm: placeholder "PLANNED" khi BOM chưa có order để luôn hiện progress
 * (user feedback: "không hiển thị tiến độ" → show cho mọi row).
 */

export type MaterialStatus =
  | "NO_ORDERS"
  | "PLANNED"
  | "PURCHASING"
  | "PARTIAL"
  | "AVAILABLE"
  | "ISSUED";

interface StatusMeta {
  label: string;
  icon: LucideIcon;
  bar: string; // progress bar fill class
  barBg: string; // track bg
  text: string; // text + icon color
  badgeBg: string; // subtle bg badge
  defaultPct: number; // 0-100
}

const STATUS_META: Record<MaterialStatus, StatusMeta> = {
  NO_ORDERS: {
    label: "Chưa có đơn",
    icon: MinusCircle,
    bar: "bg-zinc-300",
    barBg: "bg-zinc-100",
    text: "text-zinc-500",
    badgeBg: "bg-zinc-50",
    defaultPct: 0,
  },
  PLANNED: {
    label: "Chưa mua",
    icon: Clock,
    bar: "bg-amber-400",
    barBg: "bg-amber-100",
    text: "text-amber-700",
    badgeBg: "bg-amber-50",
    defaultPct: 0,
  },
  PURCHASING: {
    label: "Đang mua",
    icon: ShoppingCart,
    bar: "bg-blue-500",
    barBg: "bg-blue-100",
    text: "text-blue-700",
    badgeBg: "bg-blue-50",
    defaultPct: 30,
  },
  PARTIAL: {
    label: "Nhận một phần",
    icon: Package,
    bar: "bg-orange-500",
    barBg: "bg-orange-100",
    text: "text-orange-700",
    badgeBg: "bg-orange-50",
    defaultPct: 60,
  },
  AVAILABLE: {
    label: "Đủ hàng",
    icon: CheckCircle2,
    bar: "bg-emerald-500",
    barBg: "bg-emerald-100",
    text: "text-emerald-700",
    badgeBg: "bg-emerald-50",
    defaultPct: 100,
  },
  ISSUED: {
    label: "Đã xuất SX",
    icon: Factory,
    bar: "bg-violet-500",
    barBg: "bg-violet-100",
    text: "text-violet-700",
    badgeBg: "bg-violet-50",
    defaultPct: 100,
  },
};

export interface ProgressCellProps {
  status: MaterialStatus;
  /** 0-100; nếu không truyền dùng defaultPct theo status. */
  pct?: number;
  /** Số thực tế (hiển thị dưới thanh progress): VD "3/10 đã nhận". */
  subLabel?: string;
  className?: string;
}

export function ProgressCell({
  status,
  pct,
  subLabel,
  className,
}: ProgressCellProps) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const fill = Math.max(0, Math.min(100, pct ?? meta.defaultPct));

  return (
    <div className={cn("flex flex-col justify-center gap-0.5 px-2 py-1", className)}>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex h-4 items-center gap-0.5 rounded px-1 text-[10px] font-medium",
            meta.badgeBg,
            meta.text,
          )}
        >
          <Icon className="h-2.5 w-2.5" aria-hidden />
          {meta.label}
        </span>
        {fill > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-zinc-500">
            {fill}%
          </span>
        )}
      </div>
      <div
        className={cn("h-1.5 w-full overflow-hidden rounded-full", meta.barBg)}
        role="progressbar"
        aria-valuenow={fill}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={meta.label}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-200", meta.bar)}
          style={{ width: `${fill}%` }}
        />
      </div>
      {subLabel && (
        <span className="font-mono text-[10px] tabular-nums text-zinc-500">
          {subLabel}
        </span>
      )}
    </div>
  );
}

// Safelist các class dynamic — giúp Tailwind JIT không purge.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _safelist =
  "bg-zinc-300 bg-amber-400 bg-blue-500 bg-orange-500 bg-emerald-500 bg-violet-500 " +
  "bg-zinc-100 bg-amber-100 bg-blue-100 bg-orange-100 bg-emerald-100 bg-violet-100 " +
  "text-zinc-500 text-amber-700 text-blue-700 text-orange-700 text-emerald-700 text-violet-700 " +
  "bg-zinc-50 bg-amber-50 bg-blue-50 bg-orange-50 bg-emerald-50 bg-violet-50";
