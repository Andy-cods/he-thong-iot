"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useHealth } from "@/hooks/useHealth";

/**
 * V2 SystemHealthCard — Linear-inspired compact (design-spec §3.3.4).
 *
 * Delta V1: padding 16px giữ, dot 10→8, text 14→13.
 * Header "Hệ thống" uppercase tracking-wide 11px text-zinc-500.
 * Status row h-8 với dot 8px + label 13px + value mono 12px.
 *
 * Client component — `/api/health` qua React Query auto refresh 30s.
 * TODO V1.1: bổ sung DB/Redis/Worker real khi `/api/ready` ready.
 */

export interface SystemHealthCardProps {
  className?: string;
}

type HealthStatus = "ok" | "warn" | "down";

const dotColor: Record<HealthStatus, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  down: "bg-red-500",
};

const dotLabel: Record<HealthStatus, string> = {
  ok: "Hoạt động bình thường",
  warn: "Đang kiểm tra",
  down: "Không phản hồi",
};

export function SystemHealthCard({ className }: SystemHealthCardProps) {
  const { data, isLoading, isError, latencyMs, dataUpdatedAt } = useHealth();

  const status: HealthStatus = isError
    ? "down"
    : !data || isLoading
      ? "warn"
      : "ok";

  return (
    <div
      className={cn(
        "rounded-md border border-zinc-200 bg-white",
        className,
      )}
      aria-live="polite"
    >
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Hệ thống
        </h3>
        <span className="font-mono text-xs tabular-nums text-zinc-400">
          {dataUpdatedAt ? formatTime(dataUpdatedAt) : "—"}
        </span>
      </div>

      <ul className="divide-y divide-zinc-100">
        <HealthRow
          label="API server"
          status={status}
          value={latencyMs ? `${latencyMs} ms` : "—"}
        />
        <HealthRow
          label="Tín hiệu"
          status={status}
          value={data?.ok ? "OK" : "N/A"}
        />
        <HealthRow
          label="Xác thực"
          status="ok"
          value="JWT · cookie"
        />
      </ul>
    </div>
  );
}

function HealthRow({
  label,
  status,
  value,
}: {
  label: string;
  status: HealthStatus;
  value: string;
}) {
  return (
    <li className="flex h-8 items-center gap-2 px-4">
      <span
        aria-label={dotLabel[status]}
        className={cn("h-2 w-2 shrink-0 rounded-full", dotColor[status])}
      />
      <span className="flex-1 text-base text-zinc-900">{label}</span>
      <span className="font-mono text-sm tabular-nums text-zinc-500">
        {value}
      </span>
    </li>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}
