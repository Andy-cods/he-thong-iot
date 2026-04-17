"use client";

import * as React from "react";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  CircleOff,
  Clock,
  Diamond,
  Minus,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V2 StatusBadge — Linear-inspired compact (design-spec §3.2.15 + §3.3.6).
 *
 * - 3-channel (icon + label + color) cho color-blind safety.
 * - Size sm (h-5 / 20px) | md (h-6 / 24px).
 * - Variant semantic: neutral/info/success/warning/danger/shortage.
 * - Shortage dùng orange-500 (safety-orange) — phân biệt với warning (amber).
 * - Label font 12-13px weight 500 + icon 12-14px.
 */

export type BadgeStatus =
  // V2 semantic variants
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "shortage"
  // V1 legacy aliases (keep back-compat cho items/suppliers chưa migrate)
  | "active"
  | "inactive"
  | "draft"
  | "released"
  | "critical"
  | "ready"
  | "partial"
  | "pending"
  | "pass"
  | "fail";

export interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

interface StatusMeta {
  defaultLabel: string;
  icon: React.ElementType;
  color: string;
}

const STATUS_MAP: Record<BadgeStatus, StatusMeta> = {
  // V2 semantic
  neutral: {
    defaultLabel: "—",
    icon: Circle,
    color: "bg-zinc-100 text-zinc-700 border-zinc-200",
  },
  info: {
    defaultLabel: "Thông tin",
    icon: CircleDot,
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  success: {
    defaultLabel: "Thành công",
    icon: CheckCircle2,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  warning: {
    defaultLabel: "Cảnh báo",
    icon: TriangleAlert,
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  danger: {
    defaultLabel: "Nguy hiểm",
    icon: XCircle,
    color: "bg-red-50 text-red-700 border-red-200",
  },
  shortage: {
    defaultLabel: "Thiếu",
    icon: TriangleAlert,
    color: "bg-orange-50 text-orange-700 border-orange-200",
  },
  // V1 legacy aliases → map sang V2 semantic
  active: {
    defaultLabel: "Đang hoạt động",
    icon: CircleDot,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  inactive: {
    defaultLabel: "Ngưng hoạt động",
    icon: CircleOff,
    color: "bg-zinc-100 text-zinc-600 border-zinc-200",
  },
  draft: {
    defaultLabel: "Nháp",
    icon: Circle,
    color: "bg-zinc-100 text-zinc-600 border-zinc-200",
  },
  released: {
    defaultLabel: "Đã phát hành",
    icon: Diamond,
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  critical: {
    defaultLabel: "Nghiêm trọng",
    icon: XCircle,
    color: "bg-red-50 text-red-700 border-red-200",
  },
  ready: {
    defaultLabel: "Sẵn sàng",
    icon: CheckCircle2,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  partial: {
    defaultLabel: "Một phần",
    icon: Minus,
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  pending: {
    defaultLabel: "Chờ xử lý",
    icon: Clock,
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  pass: {
    defaultLabel: "PASS",
    icon: CheckCircle2,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  fail: {
    defaultLabel: "FAIL",
    icon: XCircle,
    color: "bg-red-50 text-red-700 border-red-200",
  },
};

export function StatusBadge({
  status,
  label,
  size = "md",
  showIcon = true,
  className,
}: StatusBadgeProps) {
  const meta = STATUS_MAP[status];
  const Icon = meta.icon;
  const text = label ?? meta.defaultLabel;

  // V2 compact: sm 20px / md 24px — text 12px weight 500, icon 12-14px.
  const sizeClass =
    size === "sm"
      ? "h-5 px-1.5 text-sm gap-1"
      : "h-6 px-2 text-base gap-1";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border font-medium",
        meta.color,
        sizeClass,
        className,
      )}
    >
      {showIcon ? (
        <Icon
          className={cn(iconSize, "shrink-0")}
          strokeWidth={2}
          aria-hidden="true"
        />
      ) : null}
      <span>{text}</span>
    </span>
  );
}
