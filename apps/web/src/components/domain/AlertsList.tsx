"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, PackageMinus, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Direction B — AlertsList (design-spec §2.2 AlertsSidebar).
 *
 * V1: mock alerts (shortage > 20%, PO overdue). Khi Order/PO module ready
 * V1.1 sẽ fetch `/api/dashboard/alerts`.
 */

export type AlertSeverity = "warning" | "danger" | "info";

export interface DashboardAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description?: string;
  href?: string;
  kind: "shortage" | "overdue" | "stock-min";
}

export interface AlertsListProps {
  alerts: DashboardAlert[];
  loading?: boolean;
  className?: string;
}

const severityBg: Record<AlertSeverity, string> = {
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
};

const kindIcon: Record<DashboardAlert["kind"], React.ElementType> = {
  shortage: PackageMinus,
  overdue: Timer,
  "stock-min": AlertTriangle,
};

export function AlertsList({ alerts, loading, className }: AlertsListProps) {
  if (loading) {
    return (
      <div
        aria-busy="true"
        className={cn(
          "rounded-md border border-slate-200 bg-white p-4",
          className,
        )}
      >
        <Skeleton className="mb-3 h-5 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-slate-200 bg-white p-4",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          Cảnh báo ({alerts.length})
        </h3>
      </div>

      {alerts.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          Không có cảnh báo nào.
        </p>
      ) : (
        <ul className="space-y-2">
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
  const body = (
    <>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm",
          severityBg[alert.severity],
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {alert.title}
        </p>
        {alert.description ? (
          <p className="truncate text-xs text-slate-500">
            {alert.description}
          </p>
        ) : null}
      </div>
      {alert.href ? (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-slate-400"
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
          className="flex items-center gap-3 rounded-sm border border-transparent p-2 transition-colors hover:border-slate-200 hover:bg-slate-50 focus:outline-none focus-visible:shadow-focus"
        >
          {body}
        </Link>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-sm p-2">{body}</li>
  );
}

/**
 * Mock alerts V1 — TODO V1.1: thay bằng API real.
 */
export function generateMockAlerts(): DashboardAlert[] {
  return [
    {
      id: "a1",
      severity: "danger",
      title: "SO-100 đã quá hạn 1 ngày",
      description: "Khách hàng Cơ khí Việt Tiến · thiếu 3 SKU",
      kind: "overdue",
    },
    {
      id: "a2",
      severity: "warning",
      title: "SO-103 thiếu vật tư > 20%",
      description: "4 SKU chưa đủ · Jig-CNC-200",
      kind: "shortage",
    },
    {
      id: "a3",
      severity: "warning",
      title: "7 SKU chạm mức tồn kho tối thiểu",
      description: "Cần đặt mua bổ sung trong tuần này",
      href: "/items?filter=low-stock",
      kind: "stock-min",
    },
  ];
}
