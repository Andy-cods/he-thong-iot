"use client";

import * as React from "react";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  CircleOff,
  Clock,
  Diamond,
  Factory,
  FlaskConical,
  Lock,
  Minus,
  Package,
  PackageCheck,
  ShoppingCart,
  TriangleAlert,
  Wrench,
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
  // V1.6 — snapshot state 10-color (mỗi state distinct hue)
  | "snapshot-planned"
  | "snapshot-purchasing"
  | "snapshot-inbound-qc"
  | "snapshot-available"
  | "snapshot-reserved"
  | "snapshot-in-production"
  | "snapshot-prod-qc"
  | "snapshot-issued"
  | "snapshot-assembled"
  | "snapshot-closed"
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
    color: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  },
  info: {
    defaultLabel: "Thông tin",
    icon: CircleDot,
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  },
  success: {
    defaultLabel: "Thành công",
    icon: CheckCircle2,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  },
  warning: {
    defaultLabel: "Cảnh báo",
    icon: TriangleAlert,
    color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  },
  danger: {
    defaultLabel: "Nguy hiểm",
    icon: XCircle,
    color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  },
  shortage: {
    defaultLabel: "Thiếu",
    icon: TriangleAlert,
    color: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800",
  },
  // V1.6 snapshot 10-state — mỗi state distinct color cho board view.
  "snapshot-planned": {
    defaultLabel: "Kế hoạch",
    icon: Clock,
    color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  },
  "snapshot-purchasing": {
    defaultLabel: "Đang mua",
    icon: ShoppingCart,
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  },
  "snapshot-inbound-qc": {
    defaultLabel: "QC đầu vào",
    icon: FlaskConical,
    color: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800",
  },
  "snapshot-available": {
    defaultLabel: "Sẵn hàng",
    icon: Package,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  },
  "snapshot-reserved": {
    defaultLabel: "Đã giữ",
    icon: Lock,
    color: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800",
  },
  "snapshot-in-production": {
    defaultLabel: "Đang SX",
    icon: Factory,
    color: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800",
  },
  "snapshot-prod-qc": {
    defaultLabel: "QC sản xuất",
    icon: FlaskConical,
    color: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800",
  },
  "snapshot-issued": {
    defaultLabel: "Đã xuất",
    icon: Wrench,
    color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800",
  },
  "snapshot-assembled": {
    defaultLabel: "Lắp xong",
    icon: PackageCheck,
    color: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
  },
  "snapshot-closed": {
    defaultLabel: "Đóng",
    icon: CircleOff,
    color: "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  },
  // V1 legacy aliases → map sang V2 semantic
  active: {
    defaultLabel: "Hoạt động",
    icon: CircleDot,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  },
  inactive: {
    defaultLabel: "Ngưng",
    icon: CircleOff,
    color: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  },
  draft: {
    defaultLabel: "Nháp",
    icon: Circle,
    color: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  },
  released: {
    defaultLabel: "Đã phát hành",
    icon: Diamond,
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  },
  critical: {
    defaultLabel: "Nghiêm trọng",
    icon: XCircle,
    color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  },
  ready: {
    defaultLabel: "Sẵn sàng",
    icon: CheckCircle2,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  },
  partial: {
    defaultLabel: "Một phần",
    icon: Minus,
    color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  },
  pending: {
    defaultLabel: "Chờ xử lý",
    icon: Clock,
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  },
  pass: {
    defaultLabel: "PASS",
    icon: CheckCircle2,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  },
  fail: {
    defaultLabel: "FAIL",
    icon: XCircle,
    color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
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
