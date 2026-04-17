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
 * Direction B — StatusBadge.
 * 3-channel color-blind safe: icon + label + color.
 * Dùng `*-strong` token để đảm bảo contrast AAA trên nền bg-card/bg-soft.
 */

export type BadgeStatus =
  | "active"
  | "inactive"
  | "draft"
  | "released"
  | "shortage"
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
  color: string; // full background + text class string
}

const STATUS_MAP: Record<BadgeStatus, StatusMeta> = {
  active: {
    defaultLabel: "Đang hoạt động",
    icon: CircleDot,
    color: "bg-success-soft text-success-strong",
  },
  inactive: {
    defaultLabel: "Ngưng hoạt động",
    icon: CircleOff,
    color: "bg-slate-100 text-slate-600",
  },
  draft: {
    defaultLabel: "Nháp",
    icon: Circle,
    color: "bg-slate-100 text-slate-600",
  },
  released: {
    defaultLabel: "Đã phát hành",
    icon: Diamond,
    color: "bg-info-soft text-info-strong",
  },
  shortage: {
    defaultLabel: "Thiếu",
    icon: TriangleAlert,
    color: "bg-warning-soft text-warning-strong",
  },
  critical: {
    defaultLabel: "Nghiêm trọng",
    icon: XCircle,
    color: "bg-danger-soft text-danger-strong",
  },
  ready: {
    defaultLabel: "Sẵn sàng",
    icon: CheckCircle2,
    color: "bg-success-soft text-success-strong",
  },
  partial: {
    defaultLabel: "Một phần",
    icon: Minus,
    color: "bg-warning-soft text-warning-strong",
  },
  pending: {
    defaultLabel: "Chờ xử lý",
    icon: Clock,
    color: "bg-info-soft text-info-strong",
  },
  pass: {
    defaultLabel: "PASS",
    icon: CheckCircle2,
    color: "bg-success-soft text-success-strong",
  },
  fail: {
    defaultLabel: "FAIL",
    icon: XCircle,
    color: "bg-danger-soft text-danger-strong",
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

  const sizeClass =
    size === "sm"
      ? "h-5 px-2 text-xs gap-1"
      : "h-6 px-2 text-sm gap-1";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm font-medium",
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
