"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkOrdersList, type WorkOrderStatus } from "@/hooks/useWorkOrders";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ── Status config ────────────────────────────────────────────────────────── */
const WO_STATUS: Record<WorkOrderStatus, { label: string; cls: string; dot: string }> = {
  DRAFT:       { label: "Nháp",        cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",     dot: "bg-zinc-400"   },
  QUEUED:      { label: "Chờ",         cls: "bg-blue-50 text-blue-700 ring-blue-200",      dot: "bg-blue-400"   },
  RELEASED:    { label: "Đã phát",     cls: "bg-indigo-50 text-indigo-700 ring-indigo-200",dot: "bg-indigo-500" },
  IN_PROGRESS: { label: "Đang SX",     cls: "bg-amber-50 text-amber-700 ring-amber-200",   dot: "bg-amber-500 animate-pulse" },
  PAUSED:      { label: "Tạm dừng",    cls: "bg-orange-50 text-orange-700 ring-orange-200",dot: "bg-orange-400" },
  COMPLETED:   { label: "Hoàn thành",  cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  CANCELLED:   { label: "Đã huỷ",      cls: "bg-red-50 text-red-600 ring-red-200",         dot: "bg-red-400"    },
};

const FILTER_KEYS: WorkOrderStatus[] = ["DRAFT","QUEUED","RELEASED","IN_PROGRESS","PAUSED","COMPLETED","CANCELLED"];

function WoStatusBadge({ status }: { status: WorkOrderStatus }) {
  const s = WO_STATUS[status] ?? { label: status, cls: "bg-zinc-100 text-zinc-600 ring-zinc-200", dot: "bg-zinc-400" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", s.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all",
            clamped >= 100 ? "bg-emerald-500" : clamped > 0 ? "bg-indigo-500" : "bg-zinc-300")}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="min-w-[2.5rem] font-mono text-xs tabular-nums text-zinc-600">{clamped}%</span>
    </div>
  );
}

/* ── Component ────────────────────────────────────────────────────────────── */
export function WorkOrdersPanel({ bomId }: { bomId: string }) {
  const [statuses, setStatuses] = React.useState<WorkOrderStatus[]>([]);

  const query = useWorkOrdersList({
    bomTemplateId: bomId,
    status: statuses.length > 0 ? statuses : undefined,
    page: 1,
    pageSize: 50,
  });
  const rows = query.data?.data ?? [];

  const toggleStatus = (s: WorkOrderStatus) =>
    setStatuses((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_KEYS.map((s) => {
            const active = statuses.includes(s);
            const cfg = WO_STATUS[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  active
                    ? cn("ring-1 ring-inset", cfg.cls)
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", active ? cfg.dot : "bg-zinc-300")} aria-hidden />
                {cfg.label}
              </button>
            );
          })}
          {statuses.length > 0 && (
            <button type="button" onClick={() => setStatuses([])}
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline px-1">
              Bỏ lọc
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-zinc-500">
            <span className="font-semibold text-zinc-900 tabular-nums">{rows.length}</span> WO
          </span>
          <Button size="sm" variant="outline" disabled
            title="Tạo WO cần chọn đơn hàng — vào tab Đơn hàng để tạo WO từ đơn đã snapshot.">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Tạo lệnh SX
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-medium text-zinc-700">
              {statuses.length > 0 ? "Không có WO nào khớp bộ lọc." : "Chưa có lệnh sản xuất nào."}
            </p>
            <p className="text-xs text-zinc-500">Chọn đơn hàng và tạo WO từ tab Đơn hàng.</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b-2 border-zinc-100">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Mã WO</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Đơn hàng</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Kế hoạch</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Đã SX</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Trạng thái</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Ngày giao</th>
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const planned = Number(row.plannedQty);
                const good = Number(row.goodQty);
                const pct = planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
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
                      <span className="font-mono text-sm font-semibold tabular-nums text-zinc-800">{formatNumber(good)}</span>
                      <span className="ml-1.5 text-xs text-zinc-400">({pct}%)</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <WoStatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-zinc-600">
                        {row.plannedEnd ? formatDate(row.plannedEnd, "dd/MM/yyyy") : "—"}
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
        )}
      </div>
    </div>
  );
}
