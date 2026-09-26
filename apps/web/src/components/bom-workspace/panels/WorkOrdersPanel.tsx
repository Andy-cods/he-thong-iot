"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { StatusPill } from "@/components/ui/status-badge";
import { TONE_CLASSES, getStatus } from "@/lib/status";
import { useWorkOrdersList, type WorkOrderStatus } from "@/hooks/useWorkOrders";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ── Status config ────────────────────────────────────────────────────────── */
// V4.1 UI-07: bỏ map WO_STATUS cục bộ ("Nháp"/"Chờ"/"Đã phát", "Đã huỷ" đỏ) — nhãn +
// tông lấy từ lib/status.ts domain "wo" (DRAFT = "Chờ duyệt", Đã huỷ = xám).
const FILTER_KEYS: WorkOrderStatus[] = ["DRAFT","QUEUED","RELEASED","IN_PROGRESS","PAUSED","COMPLETED","CANCELLED"];

function WoStatusBadge({ status }: { status: WorkOrderStatus }) {
  return <StatusPill domain="wo" code={status} dot pulse={status === "IN_PROGRESS"} />;
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all",
            clamped >= 100 ? "bg-emerald-500" : clamped > 0 ? "bg-indigo-500" : "bg-zinc-300")}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="min-w-[2.5rem] font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">{clamped}%</span>
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_KEYS.map((s) => {
            const active = statuses.includes(s);
            const def = getStatus("wo", s);
            const tone = TONE_CLASSES[def.tone];
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  active
                    ? cn("border-transparent ring-1 ring-inset", tone.pill)
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", active ? tone.dot : "bg-zinc-300")} aria-hidden />
                {def.label}
              </button>
            );
          })}
          {statuses.length > 0 && (
            <button type="button" onClick={() => setStatuses([])}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline px-1">
              Bỏ lọc
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">{rows.length}</span> lệnh
          </span>
          {/* V4.1 SX-16/Q4 — tạo lệnh SX trực tiếp từ BOM (phiếu LSX gắn BOM),
              không còn qua tab Đơn hàng (đang ẩn). */}
          <Button asChild size="sm" variant="outline"
            title="Lập phiếu LSX gắn BOM này (hoặc bấm nút GTAM trên dòng linh kiện gia công).">
            <Link href={`/work-orders/new-lsx?bomTemplateId=${bomId}`}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Tạo lệnh SX
            </Link>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : query.isError ? (
          /* V4.1 SX-31 — lỗi hiện rõ, không giả làm "chưa có lệnh".
             V4.1 UI-05: khối lỗi chung + nút "Thử lại". */
          <QueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Không tải được danh sách lệnh sản xuất"
          />
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {statuses.length > 0 ? "Không có lệnh sản xuất nào khớp bộ lọc." : "Chưa có lệnh sản xuất nào."}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Bấm nút GTAM trên dòng linh kiện gia công, hoặc “Tạo lệnh SX” để lập phiếu LSX gắn BOM này.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr className="border-b-2 border-zinc-100 dark:border-zinc-800">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Mã lệnh SX</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Sản phẩm</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Kế hoạch</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Đã SX</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Trạng thái</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Ngày giao</th>
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const planned = Number(row.plannedQty);
                const good = Number(row.goodQty);
                const pct = planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
                return (
                  <tr key={row.id} className="group border-b border-zinc-50 transition-colors hover:bg-zinc-50/70 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">{row.woNo}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {/* V4.1 SX-33/Q4 — Sản phẩm thay Đơn hàng. */}
                      <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{row.productSku ?? "—"}</span>
                      {row.productName ? (
                        <span className="block max-w-[240px] truncate text-xs text-zinc-500 dark:text-zinc-400" title={row.productName}>{row.productName}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-mono text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{formatNumber(planned)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-mono text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{formatNumber(good)}</span>
                      <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">({pct}%)</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <WoStatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {row.plannedEnd ? formatDate(row.plannedEnd, "dd/MM/yyyy") : "—"}
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
        )}
      </div>
    </div>
  );
}
