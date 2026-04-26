"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import {
  BOM_SNAPSHOT_STATES,
  BOM_SNAPSHOT_STATE_LABELS,
  BOM_SNAPSHOT_STATE_TONES,
  type BomSnapshotState,
} from "@iot/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useBomSnapshotLines } from "@/hooks/useBom";
import { formatNumber } from "@/lib/format";

/**
 * V2.0 P2 W6 — TASK-20260427-013.
 *
 * BomSnapshotPanel — list snapshot lines của TẤT CẢ orders dùng BOM này.
 *
 * Khác với /orders/[code] tab Snapshot Board (1 order):
 *   - Mỗi row có thêm cột "Đơn hàng" (orderNo) để biết line thuộc đơn nào.
 *   - Filter theo orderCode (text search) + state badges.
 *   - Read-only — transition state phải làm ở Order detail (hoặc Phase 2 thêm dialog).
 */
export function BomSnapshotPanel({ bomId }: { bomId: string }) {
  const [snapQ, setSnapQ] = React.useState("");
  const [orderQ, setOrderQ] = React.useState("");
  const [states, setStates] = React.useState<BomSnapshotState[]>([]);

  const filter = React.useMemo(
    () => ({
      q: snapQ.trim().length > 0 ? snapQ.trim() : undefined,
      orderCode: orderQ.trim().length > 0 ? orderQ.trim() : undefined,
      state: states.length > 0 ? states : undefined,
      page: 1,
      pageSize: 500,
    }),
    [snapQ, orderQ, states],
  );

  const query = useBomSnapshotLines(bomId, filter);
  const rows = query.data?.data ?? [];
  const byState = query.data?.meta.byState ?? [];
  const total = query.data?.meta.total ?? 0;

  if (query.isLoading && rows.length === 0) {
    return (
      <div className="space-y-1 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (total === 0 && !query.isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-xs text-zinc-500">
        Chưa có snapshot nào cho BOM này.
        <p className="text-[11px] text-zinc-400">
          Mỗi đơn hàng cần explode BOM để sinh snapshot lines tại tab Snapshot
          Board của đơn.
        </p>
      </div>
    );
  }

  const stateMap = new Map(byState.map((s) => [s.state, s.count]));

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-3 py-2">
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            value={snapQ}
            onChange={(e) => setSnapQ(e.target.value)}
            placeholder="Tìm SKU / tên..."
            className="h-7 w-48 pl-6 text-xs"
          />
        </div>
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            value={orderQ}
            onChange={(e) => setOrderQ(e.target.value)}
            placeholder="Mã đơn..."
            className="h-7 w-32 pl-6 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {BOM_SNAPSHOT_STATES.map((s) => {
            const count = stateMap.get(s) ?? 0;
            if (count === 0) return null;
            const active = states.includes(s);
            const tone = BOM_SNAPSHOT_STATE_TONES[s];
            const toneClass =
              tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : tone === "danger"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : tone === "info"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : tone === "shortage"
                        ? "border-orange-200 bg-orange-50 text-orange-700"
                        : "border-zinc-200 bg-zinc-100 text-zinc-700";
            return (
              <button
                key={s}
                type="button"
                onClick={() =>
                  setStates((prev) =>
                    prev.includes(s)
                      ? prev.filter((x) => x !== s)
                      : [...prev, s],
                  )
                }
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-[11px] font-medium transition-colors",
                  toneClass,
                  active && "ring-2 ring-blue-500 ring-offset-1",
                )}
                aria-pressed={active}
              >
                <span>{BOM_SNAPSHOT_STATE_LABELS[s]}</span>
                <span className="tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-500">
          {rows.length} / {total} line
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm">
            <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-1.5 text-left font-medium">Đơn</th>
              <th className="px-3 py-1.5 text-center font-medium">L</th>
              <th className="px-3 py-1.5 text-left font-medium">SKU</th>
              <th className="px-3 py-1.5 text-left font-medium">Tên</th>
              <th className="px-3 py-1.5 text-right font-medium">Gross</th>
              <th className="px-3 py-1.5 text-right font-medium">QC</th>
              <th className="px-3 py-1.5 text-right font-medium">Issued</th>
              <th className="px-3 py-1.5 text-right font-medium text-red-600">
                Thiếu
              </th>
              <th className="px-3 py-1.5 text-left font-medium">Trạng thái</th>
              <th className="px-3 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const tone = BOM_SNAPSHOT_STATE_TONES[r.state];
              const toneClass =
                tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : tone === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : tone === "danger"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : tone === "info"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : tone === "shortage"
                          ? "border-orange-200 bg-orange-50 text-orange-700"
                          : "border-zinc-200 bg-zinc-100 text-zinc-700";
              const shortage =
                r.remainingShortQty !== null
                  ? Number(r.remainingShortQty)
                  : 0;
              return (
                <tr key={r.id} className="h-8 hover:bg-zinc-50">
                  <td className="px-3 font-mono text-[11px] font-semibold text-indigo-600">
                    <Link
                      href={`/orders/${r.orderNo}`}
                      className="hover:underline"
                      title={`Mở đơn ${r.orderNo}`}
                    >
                      {r.orderNo}
                    </Link>
                  </td>
                  <td className="px-3 text-center text-[10px] text-zinc-500">
                    {r.level}
                  </td>
                  <td className="px-3 font-mono text-[11px] font-semibold text-zinc-700">
                    {r.componentSku}
                  </td>
                  <td
                    className="max-w-[280px] truncate px-3 text-zinc-700"
                    title={r.componentName}
                  >
                    {r.componentName}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-zinc-700">
                    {formatNumber(Number(r.grossRequiredQty))}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-emerald-700">
                    {formatNumber(Number(r.qcPassQty))}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-zinc-600">
                    {formatNumber(Number(r.issuedQty))}
                  </td>
                  <td
                    className={cn(
                      "px-3 text-right font-mono tabular-nums",
                      shortage > 0
                        ? "font-semibold text-red-600"
                        : "text-zinc-300",
                    )}
                  >
                    {shortage > 0 ? formatNumber(shortage) : "—"}
                  </td>
                  <td className="px-3">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-sm border px-1.5 text-[10px] font-medium",
                        toneClass,
                      )}
                    >
                      {BOM_SNAPSHOT_STATE_LABELS[r.state]}
                    </span>
                  </td>
                  <td className="px-1">
                    <Link
                      href={`/orders/${r.orderNo}?tab=snapshot`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600"
                      title="Mở snapshot ở đơn hàng"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
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
