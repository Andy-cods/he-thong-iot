"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Factory } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useBomProductionSummary } from "@/hooks/useBom";
import { formatDate, formatNumber } from "@/lib/format";

/* ── Status badge ─────────────────────────────────────────────────────────── */
const WO_STATUS_BADGE: Record<string, { label: string; cls: string; dot: string }> = {
  DRAFT:       { label: "Nháp",        cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",      dot: "bg-zinc-400"   },
  QUEUED:      { label: "Đợi",         cls: "bg-blue-50 text-blue-700 ring-blue-200",       dot: "bg-blue-400"   },
  RELEASED:    { label: "Phát lệnh",   cls: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-500" },
  IN_PROGRESS: { label: "Đang chạy",   cls: "bg-amber-50 text-amber-700 ring-amber-200",    dot: "bg-amber-500 animate-pulse" },
  PAUSED:      { label: "Tạm dừng",    cls: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-400" },
  COMPLETED:   { label: "Hoàn thành",  cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  CANCELLED:   { label: "Huỷ",         cls: "bg-red-50 text-red-600 ring-red-200",          dot: "bg-red-400"    },
};

function WoStatusBadge({ status }: { status: string }) {
  const s = WO_STATUS_BADGE[status] ?? { label: status, cls: "bg-zinc-100 text-zinc-600 ring-zinc-200", dot: "bg-zinc-400" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", s.cls)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const c = Math.max(0, Math.min(100, pct));
  const fill = c >= 80 ? "bg-emerald-500" : c >= 40 ? "bg-indigo-500" : "bg-zinc-400";
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-2 w-28 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-valuenow={c} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn("absolute inset-y-0 left-0 rounded-full transition-all", fill)} style={{ width: `${c}%` }} />
      </div>
      <span className="min-w-[2.5rem] font-mono text-xs tabular-nums text-zinc-600">{c}%</span>
    </div>
  );
}

/* ── KPI Card ─────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, subtitle, tone }: {
  label: string; value: number | string; subtitle?: string;
  tone: "zinc" | "emerald" | "indigo" | "blue";
}) {
  const styles = {
    zinc:    "border-zinc-200 bg-white",
    emerald: "border-emerald-200 bg-emerald-50/60",
    indigo:  "border-indigo-200 bg-indigo-50/60",
    blue:    "border-blue-200 bg-blue-50/60",
  };
  return (
    <div className={cn("rounded-xl border px-4 py-3.5", styles[tone])}>
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold tabular-nums text-zinc-900">
          {typeof value === "number" ? formatNumber(value) : value}
        </span>
        {subtitle && <span className="font-mono text-sm tabular-nums text-zinc-500">{subtitle}</span>}
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
export function BomProductionPanel({ bomId }: { bomId: string }) {
  const query = useBomProductionSummary(bomId);
  const data = query.data?.data;

  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const filteredWOs = React.useMemo(() => {
    if (!data) return [];
    return data.recentWorkOrders.filter((wo) => {
      const ps = wo.plannedStart ? new Date(wo.plannedStart).getTime() : null;
      if (dateFrom) { const f = new Date(dateFrom).getTime(); if (ps === null || ps < f) return false; }
      if (dateTo)   { const t = new Date(dateTo).getTime() + 86400000 - 1; if (ps === null || ps > t) return false; }
      return true;
    });
  }, [data, dateFrom, dateTo]);

  if (query.isLoading && !data) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {(query.error as Error)?.message ?? "Không tải được tiến độ sản xuất."}
      </div>
    );
  }
  if (!data) return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-zinc-500">Không có dữ liệu sản xuất.</div>
  );

  return (
    <div className="flex h-full flex-col">

      {/* Toolbar — date filter */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3">
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          Từ
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          Đến
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </label>
        {(dateFrom || dateTo) && (
          <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="text-sm text-indigo-600 hover:underline">Bỏ lọc</button>
        )}
        <span className="ml-auto text-xs font-medium text-zinc-500">
          <span className="tabular-nums text-zinc-900">{filteredWOs.length}</span> / <span className="tabular-nums">{data.recentWorkOrders.length}</span> WO theo Planned Start
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-auto p-5">

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Tổng WO"          value={data.totalWorkOrders}                                              tone="zinc"    />
          <KpiCard label="Đã hoàn thành"    value={data.doneWorkOrders}      subtitle={`${data.donePct}%`}           tone="emerald" />
          <KpiCard label="Đang chạy"        value={data.inProgressWorkOrders}                                         tone="indigo"  />
          <KpiCard label="SL Đã / Kế hoạch" value={formatNumber(data.totalGoodQty)} subtitle={`/${formatNumber(data.totalPlannedQty)} (${data.qtyDonePct}%)`} tone="blue" />
        </div>

        {/* Material readiness */}
        {data.snapshotSummary && (
          <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-700">Sẵn sàng vật liệu</span>
              <span className="font-mono text-sm tabular-nums text-zinc-600">
                {data.snapshotSummary.materialReadyPct}% sẵn sàng ·{" "}
                {data.snapshotSummary.shortageLines > 0 ? (
                  <span className="text-red-600">{data.snapshotSummary.shortageLines} line thiếu</span>
                ) : (
                  <span className="text-emerald-600">Đủ</span>
                )}{" "}
                · <span className="tabular-nums">{data.snapshotSummary.totalLines}</span> line
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, data.snapshotSummary.materialReadyPct))}%` }} />
            </div>
          </div>
        )}

        {/* Recent WO table */}
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-zinc-100 px-5 py-3.5">
            <Factory className="h-4 w-4 text-zinc-500" aria-hidden />
            <h3 className="text-sm font-semibold text-zinc-900">Work Orders gần đây</h3>
            {filteredWOs.length > 0 && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 tabular-nums">
                {filteredWOs.length} / {data.recentWorkOrders.length} WO
              </span>
            )}
          </div>

          {filteredWOs.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-500">
              {data.recentWorkOrders.length === 0
                ? "Chưa có Work Order nào cho BOM này."
                : "Không có WO nào trong khoảng ngày đã chọn."}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-zinc-50/80">
                <tr className="border-b border-zinc-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Mã WO</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Đơn hàng</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Trạng thái</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">SL Đạt / KH</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Tiến độ</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Ngày giao</th>
                  <th className="w-12 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredWOs.map((wo) => (
                  <tr key={wo.id} className="group border-b border-zinc-50 transition-colors hover:bg-zinc-50/70">
                    <td className="px-5 py-3.5">
                      <Link href={`/work-orders/${wo.id}`} className="font-mono text-sm font-bold text-indigo-600 hover:underline">
                        {wo.woNo}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      {wo.orderNo ? (
                        <Link href={`/orders/${wo.orderNo}`} className="font-mono text-sm text-zinc-700 hover:text-indigo-600 hover:underline">
                          {wo.orderNo}
                        </Link>
                      ) : <span className="text-sm text-zinc-400">—</span>}
                    </td>
                    <td className="px-5 py-3.5"><WoStatusBadge status={wo.status} /></td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-mono text-sm font-semibold tabular-nums text-zinc-800">{formatNumber(wo.goodQty)}</span>
                      <span className="text-zinc-400"> / </span>
                      <span className="font-mono text-sm tabular-nums text-zinc-600">{formatNumber(wo.plannedQty)}</span>
                    </td>
                    <td className="px-5 py-3.5"><ProgressBar pct={wo.progressPct} /></td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-zinc-600">{wo.plannedEnd ? formatDate(wo.plannedEnd, "dd/MM/yyyy") : "—"}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <Link href={`/work-orders/${wo.id}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 opacity-0 transition-all hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100">
                        <ArrowUpRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
