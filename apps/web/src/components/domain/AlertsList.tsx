"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  ChevronRight,
  PackageMinus,
  Timer,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * V2 AlertsList — Linear-inspired compact (design-spec §3.3.3).
 *
 * Delta V1: padding item 16→12, icon 16→14, title 14→13, meta 12→11.
 * Icon leading theo kind: shortage (orange) · overdue (amber) · stock-min (amber) · info (zinc).
 * CTA text-xs blue-600 hover underline.
 */

export type AlertSeverity = "warning" | "danger" | "info";

export interface DashboardAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description?: string;
  href?: string;
  kind: "shortage" | "overdue" | "stock-min" | "info";
}

export interface AlertsListProps {
  alerts: DashboardAlert[];
  loading?: boolean;
  className?: string;
}

const kindIcon: Record<DashboardAlert["kind"], React.ElementType> = {
  shortage: PackageMinus,
  overdue: Timer,
  "stock-min": AlertTriangle,
  info: Bell,
};

const severityColor: Record<AlertSeverity, string> = {
  warning: "text-amber-500",
  danger: "text-red-500",
  info: "text-blue-500",
};

// Shortage override: override severity color để luôn là safety-orange.
function iconColor(alert: DashboardAlert): string {
  if (alert.kind === "shortage") return "text-orange-500";
  return severityColor[alert.severity];
}

export function AlertsList({ alerts, loading, className }: AlertsListProps) {
  if (loading) {
    return (
      <div
        aria-busy="true"
        className={cn(
          "rounded-md border border-zinc-200 bg-white p-4",
          className,
        )}
      >
        <Skeleton className="mb-3 h-4 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-zinc-200 bg-white",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Cảnh báo ({alerts.length})
        </h3>
      </div>

      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-4 text-sm text-zinc-500">
          <XCircle className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          Không có cảnh báo nào.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {alerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AlertItem({ alert }: { alert: DashboardAlert }) {
  const Icon = kindIcon[alert.kind];
  const color = iconColor(alert);

  const body = (
    <>
      <Icon
        className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", color)}
        strokeWidth={2}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-zinc-900">
          {alert.title}
        </p>
        {alert.description ? (
          <p className="truncate text-sm text-zinc-500">
            {alert.description}
          </p>
        ) : null}
      </div>
      {alert.href ? (
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-zinc-400"
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  if (alert.href) {
    return (
      <li>
        <Link
          href={alert.href}
          className="flex items-start gap-2 px-4 py-3 transition-colors duration-100 hover:bg-zinc-50 focus:outline-none focus-visible:bg-zinc-50"
        >
          {body}
        </Link>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2 px-4 py-3">{body}</li>
  );
}

// Mock generator moved to `@/lib/dashboard-mocks.ts` (server-safe RSC import).
