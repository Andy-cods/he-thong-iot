"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Wrench } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkOrdersList, type WorkOrderStatus } from "@/hooks/useWorkOrders";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ── Status badge ─────────────────────────────────────────────────────────── */
const WO_STATUS: Record<WorkOrderStatus, { label: string; cls: string; dot: string }> = {
  DRAFT:       { label: "Nháp",       cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",      dot: "bg-zinc-400"   },
  QUEUED:      { label: "Chờ",        cls: "bg-blue-50 text-blue-700 ring-blue-200",       dot: "bg-blue-400"   },
  RELEASED:    { label: "Đã phát",    cls: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-500" },
  IN_PROGRESS: { label: "Đang SX",    cls: "bg-amber-50 text-amber-700 ring-amber-200",    dot: "bg-amber-500 animate-pulse" },
  PAUSED:      { label: "Tạm dừng",   cls: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-400" },
  COMPLETED:   { label: "Hoàn thành", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  CANCELLED:   { label: "Đã huỷ",     cls: "bg-red-50 text-red-600 ring-red-200",          dot: "bg-red-400"    },
};

function WoStatusBadge({ status }: { status: WorkOrderStatus }) {
  const s = WO_STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", s.cls)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const c = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-2 w-28 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-valuenow={c} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all", c >= 100 ? "bg-emerald-500" : c > 0 ? "bg-indigo-500" : "bg-zinc-300")}
          style={{ width: `${c}%` }}
        />
      </div>
      <span className="min-w-[2.5rem] font-mono text-xs tabular-nums text-zinc-600">{c}%</span>
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

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
          <Wrench className="h-5 w-5 text-zinc-400" aria-hidden />
        </div>
        <p className="text-sm font-medium text-zinc-700">Chưa có lệnh SX đang lắp ráp</p>
        <p className="max-w-xs text-xs text-zinc-500">
          Lắp ráp xuất hiện khi có WO ở trạng thái IN_PROGRESS / PAUSED / COMPLETED.
          Xem tab Lệnh SX để tạo WO.
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
      <div className="flex shrink-0 flex-wrap items-center gap-6 border-b border-zinc-200 bg-white px-5 py-3.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Kế hoạch</span>
          <span className="font-mono text-base font-bold tabular-nums text-zinc-900">{formatNumber(totalPlanned)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Đã SX</span>
          <span className="font-mono text-base font-bold tabular-nums text-emerald-700">{formatNumber(totalGood)}</span>
        </div>
        {totalScrap > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Phế</span>
            <span className="font-mono text-base font-bold tabular-nums text-red-600">{formatNumber(totalScrap)}</span>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <div className="relative h-2.5 w-32 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-500 transition-all" style={{ width: `${overallPct}%` }} />
          </div>
          <span className="font-mono text-sm font-bold tabular-nums text-indigo-700">{overallPct}%</span>
        </div>
        <Link href={`/work-orders?bomTemplateId=${bomId}`}
          className="ml-auto text-sm font-medium text-indigo-600 hover:underline">
          Xem tất cả WO →
        </Link>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b-2 border-zinc-100">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Mã WO</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Đơn hàng</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">KH</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Đã SX</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">% Tiến độ</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Trạng thái</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Hoàn thành</th>
              <th className="w-12 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const planned = Number(row.plannedQty);
              const good    = Number(row.goodQty);
              const pct     = planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
              return (
                <tr key={row.id} className="group border-b border-zinc-50 transition-colors hover:bg-zinc-50/70">
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-sm font-bold text-indigo-600">{row.woNo}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-sm text-zinc-700">{row.orderNo ?? "—"}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="font-mono text-sm font-semibold tabular-nums text-zinc-700">{formatNumber(planned)}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="font-mono text-sm font-semibold tabular-nums text-emerald-700">{formatNumber(good)}</span>
                  </td>
                  <td className="px-5 py-3.5"><ProgressBar pct={pct} /></td>
                  <td className="px-5 py-3.5"><WoStatusBadge status={row.status} /></td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-zinc-600">
                      {row.completedAt ? formatDate(row.completedAt, "dd/MM/yyyy") : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    <Link href={`/work-orders/${row.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 opacity-0 transition-all hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100"
                      title="Mở chi tiết WO">
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
