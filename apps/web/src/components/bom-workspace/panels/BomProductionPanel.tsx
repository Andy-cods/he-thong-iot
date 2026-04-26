"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Factory } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useBomProductionSummary } from "@/hooks/useBom";
import { formatDate, formatNumber } from "@/lib/format";

const WO_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Nháp", className: "bg-zinc-100 text-zinc-600" },
  QUEUED: { label: "Đợi", className: "bg-zinc-200 text-zinc-700" },
  RELEASED: { label: "Phát lệnh", className: "bg-blue-50 text-blue-700" },
  IN_PROGRESS: {
    label: "Đang chạy",
    className: "bg-indigo-100 text-indigo-800",
  },
  PAUSED: { label: "Tạm dừng", className: "bg-amber-100 text-amber-800" },
  COMPLETED: {
    label: "Hoàn thành",
    className: "bg-emerald-100 text-emerald-800",
  },
  CANCELLED: { label: "Huỷ", className: "bg-red-100 text-red-700" },
};

/**
 * V2.0 P2 W6 — TASK-20260427-013.
 *
 * BomProductionPanel — aggregate sản xuất theo bom_template_id (KHÔNG theo
 * 1 orderId như ProductionProgressPanel của orders/[code]).
 *
 * Hiển thị:
 *   1. KPI cards: Tổng WO / Đã xong / Đang chạy / % qty done.
 *   2. Material readiness (snapshot lines aggregate).
 *   3. Recent Work Orders list (link → /work-orders/[id]).
 */
export function BomProductionPanel({ bomId }: { bomId: string }) {
  const query = useBomProductionSummary(bomId);
  const data = query.data?.data;

  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");

  const filteredWOs = React.useMemo(() => {
    if (!data) return [];
    return data.recentWorkOrders.filter((wo) => {
      const ps = wo.plannedStart ? new Date(wo.plannedStart).getTime() : null;
      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        if (ps === null || ps < from) return false;
      }
      if (dateTo) {
        // include end-of-day
        const to = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
        if (ps === null || ps > to) return false;
      }
      return true;
    });
  }, [data, dateFrom, dateTo]);

  if (query.isLoading && !data) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {(query.error as Error)?.message ?? "Không tải được tiến độ sản xuất."}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-xs text-zinc-500">
        Không có dữ liệu sản xuất.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Inline toolbar — date filter (client-side over recentWorkOrders). */}
      <ProductionToolbar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={(f, t) => {
          setDateFrom(f);
          setDateTo(t);
        }}
        totalCount={data.recentWorkOrders.length}
        filteredCount={filteredWOs.length}
      />

      <div className="flex flex-1 flex-col gap-3 overflow-auto p-3">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiCard
          label="Tổng WO"
          value={data.totalWorkOrders}
          tone="zinc"
        />
        <KpiCard
          label="Đã hoàn thành"
          value={data.doneWorkOrders}
          subtitle={`${data.donePct}%`}
          tone="emerald"
        />
        <KpiCard
          label="Đang chạy"
          value={data.inProgressWorkOrders}
          tone="indigo"
        />
        <KpiCard
          label="SL Đã/Kế hoạch"
          value={`${formatNumber(data.totalGoodQty)}`}
          subtitle={`/${formatNumber(data.totalPlannedQty)} (${data.qtyDonePct}%)`}
          tone="blue"
        />
      </div>

      {/* Material readiness */}
      {data.snapshotSummary && (
        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-700">
              Sẵn sàng vật liệu
            </span>
            <span className="font-mono text-xs tabular-nums text-zinc-600">
              {data.snapshotSummary.materialReadyPct}% sẵn sàng ·{" "}
              {data.snapshotSummary.shortageLines > 0 ? (
                <span className="text-red-600">
                  {data.snapshotSummary.shortageLines} line thiếu
                </span>
              ) : (
                <span className="text-emerald-600">Đủ</span>
              )}{" "}
              · {data.snapshotSummary.totalLines} line
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{
                width: `${Math.max(0, Math.min(100, data.snapshotSummary.materialReadyPct))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Recent WO table */}
      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
          <Factory className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
          <h3 className="text-xs font-medium text-zinc-900">
            Work Orders gần đây
          </h3>
          {filteredWOs.length > 0 && (
            <span className="text-[10px] text-zinc-400">
              {filteredWOs.length} / {data.recentWorkOrders.length} WO
            </span>
          )}
        </div>
        {filteredWOs.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-500">
            {data.recentWorkOrders.length === 0
              ? "Chưa có Work Order nào cho BOM này."
              : "Không có WO nào trong khoảng ngày đã chọn."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-1.5 text-left">Mã WO</th>
                  <th className="px-3 py-1.5 text-left">Đơn hàng</th>
                  <th className="px-3 py-1.5 text-left">Trạng thái</th>
                  <th className="px-3 py-1.5 text-right">SL</th>
                  <th className="px-3 py-1.5 text-left min-w-[140px]">
                    Tiến độ
                  </th>
                  <th className="px-3 py-1.5 text-left">Due</th>
                  <th className="px-3 py-1.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredWOs.map((wo) => {
                  const badge = WO_STATUS_BADGE[wo.status] ?? {
                    label: wo.status,
                    className: "bg-zinc-100 text-zinc-600",
                  };
                  return (
                    <tr key={wo.id} className="h-8 hover:bg-zinc-50">
                      <td className="px-3 font-mono text-[11px] font-semibold text-indigo-700">
                        <Link
                          href={`/work-orders/${wo.id}`}
                          className="hover:underline"
                        >
                          {wo.woNo}
                        </Link>
                      </td>
                      <td className="px-3 font-mono text-[11px] text-zinc-700">
                        {wo.orderNo ? (
                          <Link
                            href={`/orders/${wo.orderNo}`}
                            className="hover:underline"
                          >
                            {wo.orderNo}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3">
                        <span
                          className={cn(
                            "inline-flex h-5 items-center rounded-sm px-1.5 text-[10px] font-medium",
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 text-right font-mono tabular-nums text-zinc-700">
                        {formatNumber(wo.goodQty)}/{formatNumber(wo.plannedQty)}
                      </td>
                      <td className="px-3">
                        <WoProgressBar pct={wo.progressPct} />
                      </td>
                      <td className="px-3 text-zinc-500">
                        {wo.plannedEnd
                          ? formatDate(wo.plannedEnd, "dd/MM/yyyy")
                          : "—"}
                      </td>
                      <td className="px-1">
                        <Link
                          href={`/work-orders/${wo.id}`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600"
                          title="Mở chi tiết WO"
                        >
                          <ArrowRight className="h-3 w-3" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function ProductionToolbar({
  dateFrom,
  dateTo,
  onChange,
  totalCount,
  filteredCount,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
  totalCount: number;
  filteredCount: number;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-3 py-2">
      <label className="flex items-center gap-1 text-[11px] text-zinc-600">
        Từ
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onChange(e.target.value, dateTo)}
          className="h-6 rounded-sm border border-zinc-200 bg-white px-1.5 text-[11px] tabular-nums focus:border-indigo-500 focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-1 text-[11px] text-zinc-600">
        Đến
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onChange(dateFrom, e.target.value)}
          className="h-6 rounded-sm border border-zinc-200 bg-white px-1.5 text-[11px] tabular-nums focus:border-indigo-500 focus:outline-none"
        />
      </label>
      {(dateFrom || dateTo) && (
        <button
          type="button"
          onClick={() => onChange("", "")}
          className="text-[10px] text-zinc-500 underline hover:text-zinc-700"
        >
          Bỏ lọc
        </button>
      )}
      <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-500">
        {filteredCount} / {totalCount} WO theo planned_start
      </span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  tone: "zinc" | "emerald" | "indigo" | "blue";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/50"
      : tone === "indigo"
        ? "border-indigo-200 bg-indigo-50/50"
        : tone === "blue"
          ? "border-blue-200 bg-blue-50/50"
          : "border-zinc-200 bg-white";
  return (
    <div className={cn("rounded-md border px-3 py-2", toneClass)}>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="font-mono text-base font-semibold tabular-nums text-zinc-900">
          {typeof value === "number" ? formatNumber(value) : value}
        </span>
        {subtitle && (
          <span className="font-mono text-[10px] tabular-nums text-zinc-500">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

function WoProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill =
    clamped >= 80
      ? "bg-emerald-500"
      : clamped >= 40
        ? "bg-indigo-500"
        : "bg-zinc-400";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-20 shrink-0 rounded-full bg-zinc-200"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-all", fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-zinc-600">
        {clamped}%
      </span>
    </div>
  );
}
