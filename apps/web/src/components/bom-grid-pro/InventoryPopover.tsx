"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, PackagePlus, Warehouse } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, getStatus } from "@/lib/status";
import { formatDate, formatNumber } from "@/lib/format";
import { InventoryKpiCards } from "@/components/inventory/InventoryKpiCards";
import { useSession } from "@/hooks/useSession";
import { AdjustInventoryDialog } from "./AdjustInventoryDialog";

/**
 * V1.7-beta.2 Phase C3 — Popover xem tồn kho nhanh 1 linh kiện.
 *
 * Mở popover → lazy fetch `/api/items/{id}/inventory-summary` (endpoint mới).
 * Hiển thị 4 KPI (Tổng / Sẵn dùng / Giữ QC / Đã giữ chỗ) + top 5 lot gần nhất.
 *
 * V3.7.53 — thêm nút "Điều chỉnh tồn" cho role warehouse + admin: mở
 * AdjustInventoryDialog cho phép bổ sung/giảm qty trực tiếp tại 1 bin (kệ).
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

// V4.1 UI-07: bỏ LOT_STATUS_CLASS / LOT_STATUS_LABEL cục bộ — nhãn + tông lô lấy
// từ lib/status.ts domain "lot" (Sẵn dùng / Giữ QC / Đã dùng hết / Hết hạn).

export function InventoryPopover({
  componentItemId,
  componentSku,
  componentName,
  children,
}: InventoryPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [adjustOpen, setAdjustOpen] = React.useState(false);

  const session = useSession();
  const roles = session.data?.roles ?? [];
  const canAdjust = roles.includes("warehouse") || roles.includes("admin");

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
        className="w-[360px] p-0 dark:bg-zinc-900 dark:border-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
          <Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-50">
              {componentName}
            </div>
            <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {componentSku || "—"}
            </div>
          </div>
        </div>

        <div className="px-3 py-2.5">
          {!componentItemId ? (
            <EmptyState text="Thiếu mã vật tư — chưa thể tra tồn." />
          ) : query.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-zinc-500 dark:text-zinc-400">
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
              <InventoryKpiCards
                summary={query.data.data.summary}
                size="xs"
              />

              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Lot gần nhất
                  </span>
                  <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                    {query.data.data.lots.length} / 5
                  </span>
                </div>
                {query.data.data.lots.length === 0 ? (
                  <EmptyState text="Chưa có lô nào cho linh kiện này." />
                ) : (
                  <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
                    {query.data.data.lots.map((lot) => (
                      <li
                        key={lot.id}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 text-[12px]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            {lot.lotCode ?? lot.serialCode ?? "—"}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                            <span
                              className={cn(
                                "inline-flex h-4 items-center rounded px-1.5 text-xs font-medium ring-1 ring-inset",
                                TONE_CLASSES[getStatus("lot", lot.status).tone].pill,
                              )}
                            >
                              {getStatus("lot", lot.status).label}
                            </span>
                            {lot.expDate ? (
                              <span>· HSD {formatDate(lot.expDate, "dd/MM/yyyy")}</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-right font-mono text-xs tabular-nums text-zinc-800 dark:text-zinc-200">
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

        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/60 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-800/60">
          {canAdjust && componentItemId ? (
            <button
              type="button"
              onClick={() => setAdjustOpen(true)}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
              title="Bổ sung / điều chỉnh tồn kho cho linh kiện này"
            >
              <PackagePlus className="h-3 w-3" aria-hidden />
              Điều chỉnh tồn
            </button>
          ) : (
            <span />
          )}
          <Link
            href={
              componentItemId
                ? `/items/${encodeURIComponent(componentItemId)}?tab=inventory`
                : "/items"
            }
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            title="Mở Danh mục vật tư — tab Tồn kho"
          >
            Xem chi tiết
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </PopoverContent>
      {canAdjust && componentItemId ? (
        <AdjustInventoryDialog
          open={adjustOpen}
          onOpenChange={setAdjustOpen}
          itemId={componentItemId}
          itemSku={componentSku}
          itemName={componentName}
          onSuccess={() => {
            // Đóng popover sau khi adjust xong để user thấy data mới khi mở lại
            setOpen(false);
          }}
        />
      ) : null}
    </Popover>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md bg-zinc-50/50 px-3 py-4 text-center text-xs text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
      {text}
    </div>
  );
}
