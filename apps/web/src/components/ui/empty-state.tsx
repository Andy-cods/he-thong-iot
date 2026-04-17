"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle,
  Inbox,
  Package,
  SearchX,
  WifiOff,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V2 EmptyState — Linear-inspired icon-based (BỎ illustration folder V1).
 * Icon 32-40px Lucide (muted color). Title 14px weight 500 + description
 * 12px zinc-500 + optional CTA buttons size sm.
 * Padding vertical 48px (py-12) để give breathing room.
 *
 * Preset → icon mapping:
 * - no-data: Package
 * - no-filter-match: SearchX
 * - error: AlertTriangle
 * - empty-success: CheckCircle
 * - offline: WifiOff
 * - scan-ready: ScanLine
 */

export type EmptyStatePreset =
  | "no-data"
  | "no-filter-match"
  | "error"
  | "empty-success"
  | "offline"
  | "scan-ready";

export interface EmptyStateProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Custom icon override preset. */
  icon?: React.ReactNode;
  /**
   * @deprecated V2 dùng `icon` — prop `illustration` giữ back-compat V1
   * để pages chưa migrate không break.
   */
  illustration?: React.ReactNode;
  preset?: EmptyStatePreset;
  /** Icon size px. Default 40. */
  iconSize?: number;
  className?: string;
}

const presetIcon: Record<EmptyStatePreset, LucideIcon> = {
  "no-data": Package,
  "no-filter-match": SearchX,
  error: AlertTriangle,
  "empty-success": CheckCircle,
  offline: WifiOff,
  "scan-ready": ScanLine,
};

const presetColor: Record<EmptyStatePreset, string> = {
  "no-data": "text-zinc-400",
  "no-filter-match": "text-zinc-400",
  error: "text-red-500",
  "empty-success": "text-emerald-500",
  offline: "text-amber-500",
  "scan-ready": "text-blue-500",
};

/** Fallback neutral icon khi không có preset và không truyền icon. */
const DEFAULT_ICON: LucideIcon = Inbox;

export function EmptyState({
  title,
  description,
  actions,
  icon,
  illustration,
  preset,
  iconSize = 40,
  className,
}: EmptyStateProps) {
  const iconNode =
    icon ??
    illustration ??
    (preset ? (
      <PresetIcon preset={preset} size={iconSize} />
    ) : (
      <DEFAULT_ICON
        className="text-zinc-400"
        size={iconSize}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    ));

  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "flex flex-col items-center text-center py-12 px-6 max-w-md mx-auto",
        className,
      )}
    >
      <div aria-hidden="true" className="mb-3">
        {iconNode}
      </div>
      <h3 className="text-md font-medium text-zinc-900">{title}</h3>
      {description ? (
        <p className="mt-1 text-sm text-zinc-500 leading-normal">
          {description}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function PresetIcon({
  preset,
  size,
}: {
  preset: EmptyStatePreset;
  size: number;
}) {
  const Icon = presetIcon[preset];
  const color = presetColor[preset];
  return (
    <Icon
      className={color}
      size={size}
      strokeWidth={1.5}
      aria-hidden="true"
    />
  );
}
