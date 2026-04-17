"use client";

import * as React from "react";
import { Activity, Server, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHealth } from "@/hooks/useHealth";

/**
 * Direction B — SystemHealthCard (design-spec §2.2 SystemHealthStrip).
 *
 * Client component — fetch `/api/health` qua React Query, auto refresh 30s.
 * Hiển thị: status indicator (● xanh/cam/đỏ) + uptime + thời gian phản hồi.
 *
 * V1: `/api/health` đơn giản chỉ trả `{ ok, ts }`. Latency tính client-side
 * bằng Date.now() diff. DB latency + queue count cần `/api/ready` — sẽ bổ
 * sung khi API sẵn sàng (TODO V1.1).
 */

export interface SystemHealthCardProps {
  className?: string;
}

export function SystemHealthCard({ className }: SystemHealthCardProps) {
  const { data, isLoading, isError, latencyMs, dataUpdatedAt } = useHealth();

  const status: "ok" | "warn" | "down" = isError
    ? "down"
    : !data || isLoading
      ? "warn"
      : "ok";

  const statusColor = {
    ok: "bg-success",
    warn: "bg-warning",
    down: "bg-danger",
  }[status];

  const statusLabel = {
    ok: "Hoạt động bình thường",
    warn: "Đang kiểm tra",
    down: "Không phản hồi",
  }[status];

  return (
    <div
      className={cn(
        "rounded-md border border-slate-200 bg-white p-4",
        className,
      )}
      aria-live="polite"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Trạng thái hệ thống</h3>
        <span className="text-xs text-slate-500">
          {dataUpdatedAt ? `Cập nhật ${formatTime(dataUpdatedAt)}` : "—"}
        </span>
      </div>

      <ul className="space-y-2 text-sm">
        <HealthRow
          icon={Server}
          label="API server"
          status={status}
          detail={latencyMs ? `${latencyMs} ms` : "—"}
          statusColor={statusColor}
          statusLabel={statusLabel}
        />
        <HealthRow
          icon={Activity}
          label="Tín hiệu"
          status={status}
          detail={data?.ok ? "OK" : "N/A"}
          statusColor={statusColor}
          statusLabel={statusLabel}
        />
        <HealthRow
          icon={ShieldCheck}
          label="Xác thực"
          status="ok"
          detail="JWT · cookie httpOnly"
          statusColor="bg-success"
          statusLabel="Hoạt động bình thường"
        />
      </ul>

      <p className="mt-3 text-xs text-slate-500">
        {/* TODO V1.1: thay bằng /api/ready để có DB/Redis/Worker real. */}
        Dữ liệu từ <code className="font-mono">/api/health</code> · refresh 30s.
      </p>
    </div>
  );
}

function HealthRow({
  icon: Icon,
  label,
  detail,
  statusColor,
  statusLabel,
}: {
  icon: React.ElementType;
  label: string;
  status: "ok" | "warn" | "down";
  detail: string;
  statusColor: string;
  statusLabel: string;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-label={statusLabel}
        className={cn("h-2 w-2 shrink-0 rounded-full", statusColor)}
      />
      <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <span className="flex-1 text-slate-700">{label}</span>
      <span className="font-mono text-xs tabular-nums text-slate-500">
        {detail}
      </span>
    </li>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}
