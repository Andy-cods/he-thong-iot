"use client";

import { differenceInCalendarDays, parseISO } from "date-fns";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EtaProgressBarProps {
  etaDate: string | null;     // ISO date "YYYY-MM-DD" hoặc null
  orderedQty: number;
  receivedQty: number;
  today?: Date;               // injectable for testing
  className?: string;
}

export function EtaProgressBar({
  etaDate,
  orderedQty,
  receivedQty,
  today = new Date(),
  className,
}: EtaProgressBarProps) {
  // Tiến độ nhận hàng
  const receivePercent =
    orderedQty > 0
      ? Math.min(100, Math.round((receivedQty / orderedQty) * 100))
      : 0;

  const isComplete = orderedQty > 0 && receivedQty >= orderedQty;

  // ETA status
  type EtaStatus = "ok" | "warning" | "critical" | "overdue" | "no-eta";
  let daysLeft: number | null = null;
  let etaStatus: EtaStatus = "no-eta";
  let etaLabel = "Chưa có ETA";

  if (etaDate) {
    const eta = parseISO(etaDate);
    daysLeft = differenceInCalendarDays(eta, today);

    if (isComplete) {
      etaStatus = "ok";
      etaLabel = "Đã nhận đủ";
    } else if (daysLeft < 0) {
      etaStatus = "overdue";
      etaLabel = `Quá hạn ${Math.abs(daysLeft)} ngày`;
    } else if (daysLeft === 0) {
      etaStatus = "critical";
      etaLabel = "Hôm nay là ETA";
    } else if (daysLeft <= 2) {
      etaStatus = "critical";
      etaLabel = `Còn ${daysLeft} ngày`;
    } else if (daysLeft <= 7) {
      etaStatus = "warning";
      etaLabel = `Còn ${daysLeft} ngày`;
    } else {
      etaStatus = "ok";
      etaLabel = `Còn ${daysLeft} ngày`;
    }
  }

  const barColor: Record<EtaStatus, string> = {
    ok:       "bg-emerald-500",
    warning:  "bg-amber-500",
    critical: "bg-orange-500",
    overdue:  "bg-red-500",
    "no-eta": "bg-zinc-300",
  };

  const textColor: Record<EtaStatus, string> = {
    ok:       "text-emerald-700",
    warning:  "text-amber-700",
    critical: "text-orange-700",
    overdue:  "text-red-700",
    "no-eta": "text-zinc-500",
  };

  const Icon =
    isComplete
      ? CheckCircle2
      : etaStatus === "overdue" || etaStatus === "critical"
        ? AlertTriangle
        : Clock;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {/* Progress bar nhận hàng */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              barColor[etaStatus],
            )}
            style={{ width: `${receivePercent}%` }}
            role="progressbar"
            aria-valuenow={receivePercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Đã nhận ${receivePercent}%`}
          />
        </div>
        <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-600">
          {receivePercent}%
        </span>
      </div>

      {/* ETA label */}
      <div
        className={cn(
          "flex items-center gap-1 text-xs",
          textColor[etaStatus],
        )}
      >
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>{etaLabel}</span>
        {etaDate && !isComplete && daysLeft !== null && (
          <span className="text-zinc-400">· ETA {etaDate}</span>
        )}
      </div>
    </div>
  );
}
