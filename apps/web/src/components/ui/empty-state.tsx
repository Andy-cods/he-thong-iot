"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  EmptyAlert,
  EmptyBox,
  EmptyInbox,
  EmptySearch,
  OfflineCloud,
  ScanReady,
} from "./illustrations";

/**
 * Direction B — EmptyState (design-spec §3.11).
 * Slot illustration + title + description + CTA buttons.
 * Preset: no-data, no-filter-match, error, empty-success, offline, scan-ready.
 * Illustrations: inline line-art SVG, slate-400 stroke, no external asset.
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
  illustration?: React.ReactNode;
  preset?: EmptyStatePreset;
  className?: string;
}

const presetIllustration: Record<
  EmptyStatePreset,
  React.ComponentType<{ className?: string; size?: number }>
> = {
  "no-data": EmptyBox,
  "no-filter-match": EmptySearch,
  error: EmptyAlert,
  "empty-success": EmptyInbox,
  offline: OfflineCloud,
  "scan-ready": ScanReady,
};

const presetColor: Record<EmptyStatePreset, string> = {
  "no-data": "text-slate-400",
  "no-filter-match": "text-slate-400",
  error: "text-danger",
  "empty-success": "text-success",
  offline: "text-slate-400",
  "scan-ready": "text-slate-500",
};

export function EmptyState({
  title,
  description,
  actions,
  illustration,
  preset,
  className,
}: EmptyStateProps) {
  const illustrationNode =
    illustration ?? (preset ? <PresetIllustration preset={preset} /> : null);

  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "flex flex-col items-center text-center py-12 px-6 max-w-md mx-auto",
        className,
      )}
    >
      {illustrationNode ? (
        <div aria-hidden="true" className="mb-4">
          {illustrationNode}
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {description ? (
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      ) : null}
      {actions ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function PresetIllustration({ preset }: { preset: EmptyStatePreset }) {
  const Illustration = presetIllustration[preset];
  const color = presetColor[preset];
  return <Illustration className={color} size={128} />;
}
