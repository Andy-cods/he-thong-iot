"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Warehouse } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

/**
 * V1.7-beta.2 Phase C3 — Popover xem tồn kho nhanh 1 linh kiện.
 *
 * Mở popover → lazy fetch `/api/items/{id}/inventory-summary` (endpoint mới).
 * Hiển thị 4 KPI (Tổng / Sẵn dùng / Giữ QC / Đã giữ chỗ) + top 5 lot gần nhất.
 * Graceful fallback: nếu fetch fail → show "Chưa có dữ liệu tồn".
 */

export interface InventoryPopoverProps {
  componentItemId: string | null;
  componentSku: string;
  componentName: string;
  children: React.ReactNode;
}

interface InventorySummaryResponse {
  data: {
    summary: {
      availableQty: number;
      holdQty: number;
      consumedQty: number;
      expiredQty: number;
      totalQty: number;
      reservedQty: number;
    };
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

export function InventoryPopover({
  componentItemId,
  componentSku,
  componentName,
  children,
}: InventoryPopoverProps) {
  const [open, setOpen] = React.useState(false);

  const query = useQuery<InventorySummaryResponse>({
    queryKey: ["inventory-summary", componentItemId],
    queryFn: async () => {
      const res = await fetch(
        `/api/items/${componentItemId}/inventory-summary`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as InventorySummaryResponse;
    },
    enabled: open && !!componentItemId,
    staleTime: 30_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[360px] p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 border-b border-zinc-100 px-3 py-2">
          <Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-zinc-900">
              {componentName}
            </div>
            <div className="font-mono text-[11px] text-zinc-500">
              {componentSku || "—"}
            </div>
          </div>
        </div>

        <div className="px-3 py-2.5">
          {!componentItemId ? (
            <EmptyState text="Thiếu mã item — chưa thể tra tồn." />
          ) : query.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Đang tải tồn kho…
            </div>
          ) : query.isError ? (
            <EmptyState
              text={
                query.error?.message
                  ? `Lỗi: ${query.error.message}`
                  : "Không tải được tồn kho."
              }
            />
          ) : query.data ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Kpi
                  label="Tổng tồn"
                  value={query.data.data.summary.totalQty}
                  accent="indigo"
                />
                <Kpi
                  label="Sẵn dùng"
                  value={query.data.data.summary.availableQty}
                  accent="emerald"
                />
                <Kpi
                  label="Giữ QC"
                  value={query.data.data.summary.holdQty}
                  accent="amber"
                />
                <Kpi
                  label="Đã giữ chỗ"
                  value={query.data.data.summary.reservedQty}
                  accent="blue"
                />
              </div>

              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Lot gần nhất
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    {query.data.data.lots.length} / 5
                  </span>
                </div>
                {query.data.data.lots.length === 0 ? (
                  <EmptyState text="Chưa có lot nào cho linh kiện này." />
                ) : (
                  <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-100">
                    {query.data.data.lots.map((lot) => (
                      <li
                        key={lot.id}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 text-[12px]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[11px] font-medium text-zinc-800">
                            {lot.lotCode ?? lot.serialCode ?? "—"}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                            <span
                              className={cn(
                                "inline-flex h-4 items-center rounded px-1.5 text-[9px] font-medium ring-1 ring-inset",
                                LOT_STATUS_CLASS[lot.status] ??
                                  "bg-zinc-50 text-zinc-600 ring-zinc-200",
                              )}
                            >
                              {LOT_STATUS_LABEL[lot.status] ?? lot.status}
                            </span>
                            {lot.expDate ? (
                              <span>· HSD {lot.expDate}</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-800">
                          {formatNumber(lot.onHandQty)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <EmptyState text="Chưa có dữ liệu." />
          )}
        </div>

        <div className="flex items-center justify-end border-t border-zinc-100 bg-zinc-50/60 px-3 py-1.5">
          <Link
            href={
              componentItemId
                ? `/lot-serial?itemId=${encodeURIComponent(componentItemId)}`
                : "/lot-serial"
            }
            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
          >
            Xem tất cả lot
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "indigo" | "emerald" | "amber" | "blue";
}) {
  const cls = {
    indigo: "text-indigo-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    blue: "text-blue-700",
  }[accent];
  return (
    <div className="rounded-md border border-zinc-100 bg-zinc-50/60 px-2 py-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={cn("font-mono text-[15px] font-semibold tabular-nums", cls)}>
        {formatNumber(value)}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md bg-zinc-50/50 px-3 py-4 text-center text-[11px] text-zinc-500">
      {text}
    </div>
  );
}
