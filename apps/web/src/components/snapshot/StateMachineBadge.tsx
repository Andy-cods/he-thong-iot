"use client";

import * as React from "react";
import {
  Archive,
  CheckCircle2,
  Circle,
  CircleDot,
  ClipboardCheck,
  Hammer,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Warehouse,
} from "lucide-react";
import {
  BOM_SNAPSHOT_STATE_LABELS,
  type BomSnapshotState,
} from "@iot/shared";
import { cn } from "@/lib/utils";

/**
 * V1.2 StateMachineBadge — 10-state snapshot line badge.
 *
 * 3-channel (icon + label VN + color) đồng bộ StatusBadge (color-blind safety).
 * Size sm (h-5 20px) | md (h-6 24px) — cùng scale với StatusBadge.
 *
 * Color palette (design V1.1 §4):
 *   PLANNED        — zinc (neutral, chưa bắt đầu)
 *   PURCHASING     — blue (đang đi bên ngoài)
 *   IN_PRODUCTION  — indigo (xưởng đang làm)
 *   INBOUND_QC     — amber (warning, chờ QC)
 *   PROD_QC        — amber (warning, chờ QC)
 *   AVAILABLE      — emerald (success)
 *   RESERVED       — sky (đã giữ chỗ)
 *   ISSUED         — cyan (đã xuất kho)
 *   ASSEMBLED      — emerald đậm (hoàn tất 1 nhánh)
 *   CLOSED         — zinc (final, đã đóng)
 */

interface StateMeta {
  icon: React.ElementType;
  color: string;
}

const STATE_META: Record<BomSnapshotState, StateMeta> = {
  PLANNED: {
    icon: Circle,
    color: "bg-zinc-100 text-zinc-700 border-zinc-200",
  },
  PURCHASING: {
    icon: ShoppingCart,
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  IN_PRODUCTION: {
    icon: Hammer,
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  INBOUND_QC: {
    icon: ClipboardCheck,
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  PROD_QC: {
    icon: ShieldCheck,
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  AVAILABLE: {
    icon: Warehouse,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  RESERVED: {
    icon: PackageCheck,
    color: "bg-sky-50 text-sky-700 border-sky-200",
  },
  ISSUED: {
    icon: Truck,
    color: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  ASSEMBLED: {
    icon: CheckCircle2,
    color: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  CLOSED: {
    icon: Archive,
    color: "bg-zinc-100 text-zinc-600 border-zinc-200",
  },
};

export interface StateMachineBadgeProps {
  state: BomSnapshotState;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

export function StateMachineBadge({
  state,
  size = "sm",
  showIcon = true,
  className,
}: StateMachineBadgeProps) {
  const meta = STATE_META[state] ?? {
    icon: CircleDot,
    color: "bg-zinc-100 text-zinc-600 border-zinc-200",
  };
  const Icon = meta.icon;
  const label = BOM_SNAPSHOT_STATE_LABELS[state] ?? state;

  const sizeClass =
    size === "sm" ? "h-5 px-1.5 text-sm gap-1" : "h-6 px-2 text-base gap-1";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border font-medium",
        meta.color,
        sizeClass,
        className,
      )}
      title={label}
    >
      {showIcon ? (
        <Icon
          className={cn(iconSize, "shrink-0")}
          strokeWidth={2}
          aria-hidden="true"
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}
