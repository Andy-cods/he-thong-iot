"use client";

import * as React from "react";
import { AlertTriangle, Inbox, SearchX, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Direction B — EmptyState.
 * Slot illustration + title + description + CTA buttons.
 * Preset: no-data, no-filter-match, error, empty-success.
 */

export type EmptyStatePreset =
  | "no-data"
  | "no-filter-match"
  | "error"
  | "empty-success";

export interface EmptyStateProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  illustration?: React.ReactNode;
  preset?: EmptyStatePreset;
  className?: string;
}

const presetIcon: Record<EmptyStatePreset, React.ElementType> = {
  "no-data": Inbox,
  "no-filter-match": SearchX,
  error: AlertTriangle,
  "empty-success": CheckCircle2,
};

const presetColor: Record<EmptyStatePreset, string> = {
  "no-data": "text-slate-400",
  "no-filter-match": "text-slate-400",
  error: "text-danger",
  "empty-success": "text-success",
};

export function EmptyState({
  title,
  description,
  actions,
  illustration,
  preset,
  className,
}: EmptyStateProps) {
  const illustrationNode = illustration ?? (preset ? (
    <PresetIllustration preset={preset} />
  ) : null);

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
  const Icon = presetIcon[preset];
  const color = presetColor[preset];
  return (
    <div
      className={cn(
        "flex h-18 w-18 items-center justify-center rounded-full bg-slate-100",
        color,
      )}
    >
      <Icon className="h-9 w-9" strokeWidth={1.5} aria-hidden="true" />
    </div>
  );
}
