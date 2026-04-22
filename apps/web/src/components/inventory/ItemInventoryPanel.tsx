"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import {
  InventoryKpiCards,
  type InventoryKpiSummary,
} from "@/components/inventory/InventoryKpiCards";

/**
 * V1.7-beta.2.4 — Panel tồn kho dùng trong `/items/[id]` tab "Kho".
 *
 * Cùng nguồn data với BomGridPro `InventoryPopover`:
 *   GET /api/items/{id}/inventory-summary
 *   → { data: { summary: {...6 fields}, lots: [top 5] } }
 *
 * V1.7-beta.2.4 chưa paginate lots (API chỉ trả top 5). V1.8 sẽ thêm
 * `?limit=N&page=N` nếu cần list đầy đủ — giờ show link "Xem tất cả lot" →
 * /lot-serial?itemId={id} để user duyệt bảng lot/serial chi tiết.
 */

interface InventorySummaryResponse {
  data: {
    summary: InventoryKpiSummary;
    lots: Array<{
      id: string;
      lotCode: string | null;
      serialCode: string | null;
      status: string;
      onHandQty: number;
      expDate: string | null;
      createdAt: string;
    }>;
  };
}

const LOT_STATUS_CLASS: Record<string, string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  HOLD: "bg-amber-50 text-amber-700 ring-amber-200",
  CONSUMED: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  EXPIRED: "bg-red-50 text-red-700 ring-red-200",
};

const LOT_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Sẵn dùng",
  HOLD: "Giữ QC",
  CONSUMED: "Đã dùng",
  EXPIRED: "Hết hạn",
};

export interface ItemInventoryPanelProps {
  itemId: string;
  minStockQty?: number;
}

export function ItemInventoryPanel({
  itemId,
  minStockQty,
}: ItemInventoryPanelProps) {
  const query = useQuery<InventorySummaryResponse>({
    queryKey: ["inventory-summary", itemId],
    queryFn: async () => {
      const res = await fetch(`/api/items/${itemId}/inventory-summary`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as InventorySummaryResponse;
    },
    enabled: !!itemId,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">Tồn kho</h3>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Dữ liệu realtime từ <span className="font-mono">inventory_txn</span>
            {" "}+ reservation. Đồng bộ với ô "Xem tồn" ở BOM Grid.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {query.isFetching ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Đang tải…
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Làm mới
          </Button>
        </div>
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Đang tải tồn kho…
        </div>
      ) : query.isError ? (
        <EmptyState
          preset="error"
          title="Không tải được tồn kho"
          description={
            query.error?.message ?? "Lỗi hệ thống. Vui lòng thử lại."
          }
          actions={
            <Button size="sm" onClick={() => query.refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : query.data ? (
        <>
          <InventoryKpiCards summary={query.data.data.summary} size="md" />

          {minStockQty !== undefined && minStockQty > 0 ? (
            <MinStockAlert
              available={query.data.data.summary.availableQty}
              minStock={minStockQty}
            />
          ) : null}

          <div className="rounded-md border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-600">
                Lot gần nhất ({query.data.data.lots.length})
              </span>
              <a
                href={`/lot-serial?itemId=${encodeURIComponent(itemId)}`}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
              >
                Xem đầy đủ tại Lot/Serial →
              </a>
            </div>
            {query.data.data.lots.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-zinc-500">
                Chưa có lot nào cho vật tư này.
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead className="bg-zinc-50/50 text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Mã lot / serial</th>
                    <th className="px-3 py-2 text-left">Trạng thái</th>
                    <th className="px-3 py-2 text-right">Tồn</th>
                    <th className="px-3 py-2 text-left">HSD</th>
                    <th className="px-3 py-2 text-left">Nhập kho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {query.data.data.lots.map((lot) => (
                    <tr key={lot.id} className="hover:bg-zinc-50/60">
                      <td className="px-3 py-2 font-mono text-[12px] text-zinc-800">
                        {lot.lotCode ?? lot.serialCode ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                            LOT_STATUS_CLASS[lot.status] ??
                              "bg-zinc-50 text-zinc-600 ring-zinc-200",
                          )}
                        >
                          {LOT_STATUS_LABEL[lot.status] ?? lot.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-800">
                        {formatNumber(lot.onHandQty)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-zinc-600">
                        {lot.expDate ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-zinc-500">
                        {formatDate(lot.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MinStockAlert({
  available,
  minStock,
}: {
  available: number;
  minStock: number;
}) {
  if (available >= minStock) {
    return (
      <div className="rounded-md border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-[12px] text-emerald-800">
        Tồn khả dụng {formatNumber(available)} ≥ ngưỡng min {formatNumber(minStock)}.
      </div>
    );
  }
  const shortage = minStock - available;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-800">
      Tồn khả dụng {formatNumber(available)} dưới ngưỡng min{" "}
      {formatNumber(minStock)} — thiếu {formatNumber(shortage)}. Cần đặt mua bổ
      sung.
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
