"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  Clock,
  Factory,
  Plus,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkOrdersList, type WorkOrderStatus } from "@/hooks/useWorkOrders";
import type { WorkOrderFilter } from "@/lib/query-keys";
import { BomFilterChip } from "@/components/bom/BomFilterChip";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  WorkOrderStatus,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
    dot: string;
  }
> = {
  DRAFT: {
    label: "Nháp",
    color: "text-zinc-600",
    bg: "bg-zinc-50",
    border: "border-zinc-200",
    dot: "bg-zinc-400",
  },
  QUEUED: {
    label: "Hàng đợi",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    dot: "bg-blue-400",
  },
  RELEASED: {
    label: "Đã phát hành",
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    dot: "bg-indigo-500",
  },
  IN_PROGRESS: {
    label: "Đang sản xuất",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    dot: "bg-orange-500",
  },
  PAUSED: {
    label: "Tạm dừng",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  COMPLETED: {
    label: "Hoàn thành",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  CANCELLED: {
    label: "Đã hủy",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    dot: "bg-red-400",
  },
};

const PRIORITY_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  LOW: { label: "Thấp", color: "text-zinc-500" },
  NORMAL: { label: "Bình thường", color: "text-blue-600" },
  HIGH: { label: "Cao", color: "text-orange-600" },
  URGENT: { label: "Khẩn cấp", color: "text-red-600" },
};

export function WorkOrdersTab() {
  const [urlState, setUrlState] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      status: parseAsString.withDefault("all"),
      bomTemplateId: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
    },
    { history: "replace", shallow: true, throttleMs: 250 },
  );

  const [searchInput, setSearchInput] = React.useState(urlState.q);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== urlState.q)
        void setUrlState({ q: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const filter: WorkOrderFilter = React.useMemo(() => {
    const f: WorkOrderFilter = {
      q: urlState.q || undefined,
      bomTemplateId: urlState.bomTemplateId || undefined,
      page: urlState.page,
      pageSize: urlState.pageSize,
    };
    if (urlState.status !== "all")
      f.status = [urlState.status as WorkOrderStatus];
    return f;
  }, [urlState]);

  // Fetch all for stats (cap 200)
  const allQuery = useWorkOrdersList({ page: 1, pageSize: 200 });
  const query = useWorkOrdersList(filter);
  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const allRows = allQuery.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));

  const stats = React.useMemo(
    () => ({
      total: allQuery.data?.meta.total ?? 0,
      inProgress: allRows.filter((r) => r.status === "IN_PROGRESS").length,
      completed: allRows.filter((r) => r.status === "COMPLETED").length,
      queued: allRows.filter(
        (r) => r.status === "QUEUED" || r.status === "RELEASED",
      ).length,
    }),
    [allRows, allQuery.data],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with stats */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
                <Factory className="h-4 w-4 text-orange-600" aria-hidden />
              </div>
              <h1 className="text-lg font-semibold text-zinc-900">
                Lệnh sản xuất
              </h1>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Quản lý và theo dõi tiến độ sản xuất
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/work-orders/new">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Tạo WO mới
            </Link>
          </Button>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            {
              icon: TrendingUp,
              label: "Tổng WO",
              value: stats.total,
              color: "text-zinc-600",
              bg: "bg-zinc-50",
            },
            {
              icon: Activity,
              label: "Đang SX",
              value: stats.inProgress,
              color: "text-orange-600",
              bg: "bg-orange-50",
            },
            {
              icon: Clock,
              label: "Chờ / Phát hành",
              value: stats.queued,
              color: "text-indigo-600",
              bg: "bg-indigo-50",
            },
            {
              icon: CheckCircle2,
              label: "Hoàn thành",
              value: stats.completed,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
            },
          ].map((s) => (
            <div
              key={s.label}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2",
                s.bg,
              )}
            >
              <s.icon
                className={cn("h-4 w-4 shrink-0", s.color)}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {s.label}
                </p>
                <p
                  className={cn(
                    "font-mono text-lg font-bold leading-none tabular-nums",
                    s.color,
                  )}
                >
                  {s.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* BOM filter chip */}
      {urlState.bomTemplateId ? (
        <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">
            Lọc theo BOM:
          </span>
          <BomFilterChip
            bomTemplateId={urlState.bomTemplateId}
            onDismiss={() => void setUrlState({ bomTemplateId: "", page: 1 })}
          />
        </div>
      ) : null}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5">
        <Input
          placeholder="Tìm WO số, ghi chú…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="h-8 max-w-xs"
        />
        {/* Status chips */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => void setUrlState({ status: "all", page: 1 })}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              urlState.status === "all"
                ? "border-zinc-800 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400",
            )}
          >
            Tất cả
          </button>
          {(
            Object.entries(STATUS_CONFIG) as [
              WorkOrderStatus,
              (typeof STATUS_CONFIG)[WorkOrderStatus],
            ][]
          ).map(([s, cfg]) => (
            <button
              key={s}
              type="button"
              onClick={() => void setUrlState({ status: s, page: 1 })}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                urlState.status === s
                  ? cn(cfg.bg, cfg.color, cfg.border)
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400",
              )}
            >
              <span
                className={cn(
                  "mr-1 inline-block h-1.5 w-1.5 rounded-full",
                  cfg.dot,
                )}
                aria-hidden
              />
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="space-y-1 p-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              preset="no-filter-match"
              title="Chưa có Work Order nào"
              description="Tạo WO mới từ snapshot của đơn hàng đã sẵn sàng."
              actions={
                <Button asChild size="sm">
                  <Link href="/work-orders/new">
                    <Plus className="h-3.5 w-3.5" />
                    Tạo WO mới
                  </Link>
                </Button>
              }
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
              <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2.5 text-left font-medium">Số WO</th>
                <th className="px-4 py-2.5 text-left font-medium">Đơn hàng</th>
                <th className="px-4 py-2.5 text-left font-medium">Ưu tiên</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  KH / Đạt
                </th>
                <th className="px-4 py-2.5 text-left font-medium">Tiến độ</th>
                <th className="px-4 py-2.5 text-left font-medium">
                  Trạng thái
                </th>
                <th className="px-4 py-2.5 text-left font-medium">Ghi chú</th>
                <th className="w-20 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => {
                const planned = Number(r.plannedQty);
                const good = Number(r.goodQty);
                const pct =
                  planned > 0
                    ? Math.min(100, Math.round((good / planned) * 100))
                    : 0;
                const cfg = STATUS_CONFIG[r.status];
                const pri =
                  PRIORITY_CONFIG[r.priority] ?? PRIORITY_CONFIG.NORMAL!;
                return (
                  <tr
                    key={r.id}
                    className="group cursor-pointer transition-colors hover:bg-zinc-50/80"
                    onClick={() => {
                      window.location.href = `/work-orders/${r.id}`;
                    }}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/work-orders/${r.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-xs font-bold text-indigo-700 hover:underline"
                      >
                        {r.woNo}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {r.createdAt
                          ? new Date(r.createdAt).toLocaleDateString("vi-VN")
                          : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-700">
                      {r.orderNo ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs font-medium", pri.color)}>
                        {pri.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="tabular-nums text-sm font-semibold text-zinc-800">
                        {planned}
                      </span>
                      <span className="text-zinc-400"> / </span>
                      <span
                        className={cn(
                          "tabular-nums text-sm font-semibold",
                          good >= planned
                            ? "text-emerald-600"
                            : "text-zinc-600",
                        )}
                      >
                        {good}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className={cn(
                              "absolute inset-y-0 left-0 rounded-full transition-all",
                              pct >= 100
                                ? "bg-emerald-500"
                                : pct > 0
                                  ? "bg-indigo-500"
                                  : "bg-zinc-300",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="min-w-[2.5rem] text-right text-[11px] tabular-nums text-zinc-600">
                          {pct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                          cfg.bg,
                          cfg.color,
                          cfg.border,
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            cfg.dot,
                          )}
                          aria-hidden
                        />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="max-w-[180px] px-4 py-3 text-xs text-zinc-500">
                      <span className="line-clamp-1">{r.notes ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="invisible flex items-center gap-1 group-hover:visible">
                        <Link
                          href={`/work-orders/${r.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100"
                          title="Chi tiết WO"
                        >
                          Chi tiết
                        </Link>
                        {(r.status === "IN_PROGRESS" ||
                          r.status === "RELEASED") && (
                          <Link
                            href={`/assembly/${r.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] text-orange-700 hover:bg-orange-100"
                            title="Mở xưởng lắp ráp"
                          >
                            <Wrench className="inline h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer pagination */}
      <footer className="flex h-10 items-center justify-between border-t border-zinc-200 bg-white px-4 text-xs text-zinc-600">
        <span>
          Trang{" "}
          <span className="tabular-nums">
            {urlState.page}/{pageCount}
          </span>{" "}
          · {total.toLocaleString("vi-VN")} WO
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={urlState.page <= 1}
            onClick={() =>
              void setUrlState({ page: Math.max(1, urlState.page - 1) })
            }
          >
            ‹
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={urlState.page >= pageCount}
            onClick={() =>
              void setUrlState({
                page: Math.min(pageCount, urlState.page + 1),
              })
            }
          >
            ›
          </Button>
        </div>
      </footer>
    </div>
  );
}
