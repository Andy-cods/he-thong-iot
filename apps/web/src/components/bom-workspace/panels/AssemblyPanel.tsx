"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Wrench } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { StatusPill } from "@/components/ui/status-badge";
import { statusLabel } from "@/lib/status";
import { useWorkOrdersList, type WorkOrderStatus } from "@/hooks/useWorkOrders";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ── Status badge ─────────────────────────────────────────────────────────── */
// V4.1 UI-07: bỏ map WO_STATUS cục bộ ("Đã huỷ" đỏ) — dùng lib/status.ts domain "wo".
function WoStatusBadge({ status }: { status: WorkOrderStatus }) {
  return <StatusPill domain="wo" code={status} dot pulse={status === "IN_PROGRESS"} />;
}

function ProgressBar({ pct }: { pct: number }) {
  const c = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-2 w-28 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="progressbar" aria-valuenow={c} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all", c >= 100 ? "bg-emerald-500" : c > 0 ? "bg-indigo-500" : "bg-zinc-300")}
          style={{ width: `${c}%` }}
        />
      </div>
      <span className="min-w-[2.5rem] font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">{c}%</span>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
export function AssemblyPanel({ bomId }: { bomId: string }) {
  const query = useWorkOrdersList({
    bomTemplateId: bomId,
    status: ["IN_PROGRESS", "PAUSED", "COMPLETED"],
    page: 1,
    pageSize: 50,
  });
  const rows = query.data?.data ?? [];

  if (query.isLoading) {
    return (
      <div className="space-y-2 p-5">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    );
  }

  // V4.1 UI-05: lỗi API không được hiện "Chưa có lệnh SX".
  if (query.isError && rows.length === 0) {
    return (
      <QueryError
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        title="Không tải được lệnh sản xuất"
      />
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
          <Wrench className="h-5 w-5 text-zinc-400 dark:text-zinc-500" aria-hidden />
        </div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Chưa có lệnh SX đang lắp ráp</p>
        <p className="max-w-xs text-xs text-zinc-500 dark:text-zinc-400">
          Lắp ráp xuất hiện khi có lệnh SX ở trạng thái {statusLabel("wo", "IN_PROGRESS")} /{" "}
          {statusLabel("wo", "PAUSED")} / {statusLabel("wo", "COMPLETED")}. Xem tab Lệnh SX để tạo lệnh.
        </p>
      </div>
    );
  }

  const totalPlanned = rows.reduce((s, r) => s + Number(r.plannedQty), 0);
  const totalGood    = rows.reduce((s, r) => s + Number(r.goodQty), 0);
  const totalScrap   = rows.reduce((s, r) => s + Number(r.scrapQty), 0);
  const overallPct   = totalPlanned > 0 ? Math.min(100, Math.round((totalGood / totalPlanned) * 100)) : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Aggregate header */}
      <div className="flex shrink-0 flex-wrap items-center gap-6 border-b border-zinc-200 bg-white px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Kế hoạch</span>
          <span className="font-mono text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{formatNumber(totalPlanned)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Đã SX</span>
          <span className="font-mono text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{formatNumber(totalGood)}</span>
        </div>
        {totalScrap > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Phế</span>
            <span className="font-mono text-base font-bold tabular-nums text-red-600 dark:text-red-400">{formatNumber(totalScrap)}</span>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <div className="relative h-2.5 w-32 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-500 transition-all" style={{ width: `${overallPct}%` }} />
          </div>
          <span className="font-mono text-sm font-bold tabular-nums text-indigo-700 dark:text-indigo-400">{overallPct}%</span>
        </div>
        <Link href={`/work-orders?bomTemplateId=${bomId}`}
          className="ml-auto text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
          Xem tất cả lệnh SX →
        </Link>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr className="border-b-2 border-zinc-100 dark:border-zinc-800">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Mã lệnh SX</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Đơn hàng</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">KH</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Đã SX</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">% Tiến độ</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Trạng thái</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Hoàn thành</th>
              <th className="w-12 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const planned = Number(row.plannedQty);
              const good    = Number(row.goodQty);
              const pct     = planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
              return (
                <tr key={row.id} className="group border-b border-zinc-50 transition-colors hover:bg-zinc-50/70 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40">
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">{row.woNo}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{row.orderNo ?? "—"}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="font-mono text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{formatNumber(planned)}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="font-mono text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{formatNumber(good)}</span>
                  </td>
                  <td className="px-5 py-3.5"><ProgressBar pct={pct} /></td>
                  <td className="px-5 py-3.5"><WoStatusBadge status={row.status} /></td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {row.completedAt ? formatDate(row.completedAt, "dd/MM/yyyy") : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    <Link href={`/work-orders/${row.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 opacity-0 transition-all hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100 dark:text-zinc-500 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400"
                      title="Mở chi tiết lệnh SX">
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
