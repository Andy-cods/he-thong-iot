"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useShortageList } from "@/hooks/useShortage";
import { formatNumber } from "@/lib/format";

export function ShortagePanel({ bomId }: { bomId: string }) {
  const query = useShortageList({ bomTemplateId: bomId, limit: 500 });
  const rows = query.data?.data ?? [];

  if (query.isLoading) {
    return (
      <div className="space-y-1 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-xs text-zinc-500">
        🎉 Không có linh kiện thiếu.
      </div>
    );
  }

  const total = rows.reduce((s, r) => s + r.totalShort, 0);

  return (
    <div className="overflow-auto">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-600">
        {rows.length} loại thiếu · Tổng{" "}
        <span className="font-mono font-semibold">{formatNumber(total)}</span>
      </div>
      <table className="w-full text-xs">
        <thead className="sticky top-7 z-10 bg-zinc-50/80 backdrop-blur-sm">
          <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-1.5 text-left font-medium">SKU</th>
            <th className="px-3 py-1.5 text-left font-medium">Tên</th>
            <th className="px-3 py-1.5 text-right font-medium">Cần</th>
            <th className="px-3 py-1.5 text-right font-medium">Có</th>
            <th className="px-3 py-1.5 text-right font-medium">Đang mua</th>
            <th className="px-3 py-1.5 text-right font-medium text-red-600">
              Thiếu
            </th>
            <th className="px-3 py-1.5 text-right font-medium">Đơn</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r) => (
            <tr key={r.componentItemId} className="h-8 hover:bg-zinc-50">
              <td className="px-3 font-mono text-[11px] font-semibold text-zinc-700">
                {r.componentSku}
              </td>
              <td className="px-3 text-zinc-700">{r.componentName}</td>
              <td className="px-3 text-right font-mono tabular-nums">
                {formatNumber(r.totalRequired)}
              </td>
              <td className="px-3 text-right font-mono tabular-nums text-emerald-700">
                {formatNumber(r.totalAvailable)}
              </td>
              <td className="px-3 text-right font-mono tabular-nums text-blue-700">
                {formatNumber(r.totalOnOrder)}
              </td>
              <td className="px-3 text-right font-mono font-semibold tabular-nums text-red-600">
                {formatNumber(r.totalShort)}
              </td>
              <td className="px-3 text-right font-mono tabular-nums text-zinc-500">
                {r.orderCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
