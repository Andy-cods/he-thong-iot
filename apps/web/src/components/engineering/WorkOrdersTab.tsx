"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  Clock,
  Factory,
  LayoutGrid,
  List,
  Loader2,
  Pause,
  Plus,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkOrdersList, type WorkOrderStatus, type WorkOrderRow } from "@/hooks/useWorkOrders";
import type { WorkOrderFilter } from "@/lib/query-keys";
import { BomFilterChip } from "@/components/bom/BomFilterChip";
import { cn } from "@/lib/utils";

/* ─── Status / Priority config ─────────────────────────────────────────── */

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  DRAFT:       { label: "Nháp",          color: "text-zinc-600",   bg: "bg-zinc-50",   border: "border-zinc-200",   dot: "bg-zinc-400"   },
  QUEUED:      { label: "Hàng đợi",      color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",   dot: "bg-blue-400"   },
  RELEASED:    { label: "Đã phát hành",  color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", dot: "bg-indigo-500" },
  IN_PROGRESS: { label: "Đang sản xuất", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500" },
  PAUSED:      { label: "Tạm dừng",      color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200",  dot: "bg-amber-500"  },
  COMPLETED:   { label: "Hoàn thành",    color: "text-emerald-700",bg: "bg-emerald-50",border: "border-emerald-200",dot: "bg-emerald-500"},
  CANCELLED:   { label: "Đã hủy",        color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",    dot: "bg-red-400"    },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW:    { label: "Thấp",       color: "text-zinc-500"   },
  NORMAL: { label: "Bình thường",color: "text-blue-600"   },
  HIGH:   { label: "Cao",        color: "text-orange-600" },
  URGENT: { label: "Khẩn cấp",  color: "text-red-600"    },
};

/* ─── ProgressRing (card view) ──────────────────────────────────────────── */

function ProgressRing({ pct, size = 52, strokeWidth = 5 }: { pct: number; size?: number; strokeWidth?: number }) {
  const R = (size - strokeWidth) / 2;
  const C = 2 * Math.PI * R;
  const offset = C - (Math.min(100, pct) / 100) * C;
  const stroke = pct >= 100 ? "#10b981" : pct > 0 ? "#6366f1" : "#d4d4d8";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`${pct}% hoàn thành`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#f4f4f5" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={stroke} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold tabular-nums", pct >= 100 ? "text-emerald-700" : "text-zinc-700")}>
        {pct}%
      </span>
    </div>
  );
}

/* ─── WoCard (card view) ────────────────────────────────────────────────── */

function WoCard({ wo }: { wo: WorkOrderRow }) {
  const planned = Number(wo.plannedQty);
  const good = Number(wo.goodQty);
  const pct = planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
  const remaining = Math.max(0, planned - good);
  const isPaused = wo.status === "PAUSED";
  const isDone = pct >= 100;
  const cfg = STATUS_CONFIG[wo.status];
  const pri = PRIORITY_CONFIG[wo.priority] ?? PRIORITY_CONFIG.NORMAL!;

  return (
    <Link
      href={`/work-orders/${wo.id}`}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border bg-white p-4 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5",
        isDone    ? "border-emerald-200 bg-emerald-50/30 hover:border-emerald-400" :
        isPaused  ? "border-amber-200 hover:border-amber-400" :
                    "border-zinc-200 hover:border-indigo-300",
      )}
    >
      {/* Row 1: ring + WO info */}
      <div className="flex items-center gap-3">
        <ProgressRing pct={pct} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm font-bold text-zinc-900">{wo.woNo}</code>
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", cfg.bg, cfg.color, cfg.border)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} aria-hidden />
              {cfg.label}
            </span>
          </div>
          {wo.orderNo ? (
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              Đơn: <span className="font-medium text-zinc-700">{wo.orderNo}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-zinc-400">Không liên kết đơn</p>
          )}
        </div>
      </div>

      {/* Row 2: qty */}
      <div className="flex items-baseline justify-between text-xs">
        <span>
          <span className="font-semibold tabular-nums text-zinc-900">{good}</span>
          <span className="text-zinc-400"> / {planned} cái</span>
        </span>
        {remaining > 0 ? (
          <span className="text-amber-700">Còn <strong className="tabular-nums">{remaining}</strong></span>
        ) : (
          <span className="text-emerald-600">Đủ SL</span>
        )}
      </div>

      {/* Row 3: priority + CTA */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-2 text-[11px]">
        <span className={cn("font-medium", pri.color)}>{pri.label}</span>
        <span className={cn("inline-flex items-center gap-1 font-medium transition-colors",
          isPaused ? "text-amber-600 group-hover:text-amber-700" : "text-indigo-600 group-hover:text-indigo-700"
        )}>
          {isPaused ? (
            <><Pause className="h-3 w-3" aria-hidden />Tiếp tục</>
          ) : isDone ? (
            <><CheckCircle2 className="h-3 w-3" aria-hidden />Xem lại</>
          ) : (
            <><Wrench className="h-3 w-3" aria-hidden />Vào xưởng →</>
          )}
        </span>
      </div>
    </Link>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

export function WorkOrdersTab() {
  const [urlState, setUrlState] = useQueryStates(
    {
      q:            parseAsString.withDefault(""),
      status:       parseAsString.withDefault("active"),
      bomTemplateId:parseAsString.withDefault(""),
      view:         parseAsString.withDefault("table"), // "table" | "card"
      page:         parseAsInteger.withDefault(1),
      pageSize:     parseAsInteger.withDefault(50),
    },
    { history: "replace", shallow: true, throttleMs: 250 },
  );

  const [searchInput, setSearchInput] = React.useState(urlState.q);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== urlState.q) void setUrlState({ q: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const ACTIVE_STATUSES: WorkOrderStatus[] = ["IN_PROGRESS", "QUEUED", "RELEASED", "PAUSED"];

  const filter: WorkOrderFilter = React.useMemo(() => {
    const f: WorkOrderFilter = {
      q: urlState.q || undefined,
      bomTemplateId: urlState.bomTemplateId || undefined,
      page: urlState.page,
      pageSize: urlState.pageSize,
    };
    if (urlState.status === "active") {
      f.status = ACTIVE_STATUSES;
    } else if (urlState.status !== "all") {
      f.status = [urlState.status as WorkOrderStatus];
    }
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState]);

  const allQuery = useWorkOrdersList({ page: 1, pageSize: 200 });
  const query = useWorkOrdersList(filter);
  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const allRows = allQuery.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));

  const stats = React.useMemo(() => ({
    total:      allQuery.data?.meta.total ?? 0,
    inProgress: allRows.filter((r) => r.status === "IN_PROGRESS").length,
    queued:     allRows.filter((r) => r.status === "QUEUED" || r.status === "RELEASED").length,
    completed:  allRows.filter((r) => r.status === "COMPLETED").length,
  }), [allRows, allQuery.data]);

  // Group cho card view
  const grouped = React.useMemo(() => ({
    inProg:  rows.filter((r) => r.status === "IN_PROGRESS"),
    paused:  rows.filter((r) => r.status === "PAUSED"),
    waiting: rows.filter((r) => r.status === "QUEUED" || r.status === "RELEASED"),
    draft:   rows.filter((r) => r.status === "DRAFT"),
    done:    rows.filter((r) => r.status === "COMPLETED"),
  }), [rows]);

  const STATUS_CHIPS = [
    { value: "active",      label: "Đang hoạt động" },
    { value: "all",         label: "Tất cả" },
    { value: "IN_PROGRESS", label: "Đang SX" },
    { value: "QUEUED",      label: "Hàng đợi" },
    { value: "RELEASED",    label: "Phát hành" },
    { value: "PAUSED",      label: "Tạm dừng" },
    { value: "COMPLETED",   label: "Hoàn thành" },
    { value: "DRAFT",       label: "Nháp" },
  ] as const;

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Header + Stats ── */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100">
              <Factory className="h-5 w-5 text-orange-600" aria-hidden />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">Lệnh sản xuất</h1>
              <p className="text-xs text-zinc-500">Quản lý và theo dõi tiến độ</p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link href="/work-orders/new">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Tạo WO mới
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { icon: TrendingUp,   label: "Tổng WO",          value: stats.total,      color: "text-zinc-600",   bg: "bg-zinc-50"   },
            { icon: Activity,     label: "Đang sản xuất",    value: stats.inProgress, color: "text-orange-600", bg: "bg-orange-50" },
            { icon: Clock,        label: "Chờ / Phát hành",  value: stats.queued,     color: "text-indigo-600", bg: "bg-indigo-50" },
            { icon: CheckCircle2, label: "Hoàn thành",       value: stats.completed,  color: "text-emerald-600",bg: "bg-emerald-50"},
          ].map((s) => (
            <div key={s.label} className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2.5", s.bg)}>
              <s.icon className={cn("h-4 w-4 shrink-0", s.color)} aria-hidden />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">{s.label}</p>
                <p className={cn("font-mono text-lg font-bold leading-none tabular-nums", s.color)}>
                  {allQuery.isLoading ? "—" : s.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* ── BOM filter chip ── */}
      {urlState.bomTemplateId ? (
        <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">Lọc theo BOM:</span>
          <BomFilterChip
            bomTemplateId={urlState.bomTemplateId}
            onDismiss={() => void setUrlState({ bomTemplateId: "", page: 1 })}
          />
        </div>
      ) : null}

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5">
        <Input
          placeholder="Tìm WO số, ghi chú…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="h-8 max-w-[200px]"
        />

        {/* Status chips */}
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_CHIPS.map((opt) => {
            const cfg = STATUS_CONFIG[opt.value as WorkOrderStatus];
            const isActive = urlState.status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => void setUrlState({ status: opt.value, page: 1 })}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  isActive
                    ? cfg
                      ? cn(cfg.bg, cfg.color, cfg.border)
                      : "border-zinc-800 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400",
                )}
              >
                {cfg && <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", cfg.dot)} aria-hidden />}
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* View toggle — right side */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => void setUrlState({ view: "table" })}
            className={cn("rounded-md p-1.5 transition-colors", urlState.view === "table" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100")}
            title="Dạng bảng"
          >
            <List className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void setUrlState({ view: "card" })}
            className={cn("rounded-md p-1.5 transition-colors", urlState.view === "card" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100")}
            title="Dạng card"
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          urlState.view === "card" ? (
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="space-y-1 p-4">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          )
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
        ) : urlState.view === "card" ? (
          /* ── Card view ── */
          <div className="flex flex-col gap-6 p-4">
            {grouped.inProg.length > 0 && (
              <section>
                <CardSectionHeader
                  icon={<span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />}
                  title="Đang sản xuất" count={grouped.inProg.length} color="text-orange-700"
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped.inProg.map((wo) => <WoCard key={wo.id} wo={wo} />)}
                </div>
              </section>
            )}
            {grouped.paused.length > 0 && (
              <section>
                <CardSectionHeader
                  icon={<Pause className="h-3.5 w-3.5 text-amber-500" aria-hidden />}
                  title="Tạm dừng" count={grouped.paused.length} color="text-amber-700"
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped.paused.map((wo) => <WoCard key={wo.id} wo={wo} />)}
                </div>
              </section>
            )}
            {grouped.waiting.length > 0 && (
              <section>
                <CardSectionHeader
                  icon={<span className="h-2 w-2 rounded-full bg-indigo-400" />}
                  title="Chờ / Sẵn sàng" count={grouped.waiting.length} color="text-indigo-700"
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped.waiting.map((wo) => <WoCard key={wo.id} wo={wo} />)}
                </div>
              </section>
            )}
            {grouped.draft.length > 0 && (
              <section>
                <CardSectionHeader
                  icon={<span className="h-2 w-2 rounded-full bg-zinc-300" />}
                  title="Nháp" count={grouped.draft.length} color="text-zinc-600"
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped.draft.map((wo) => <WoCard key={wo.id} wo={wo} />)}
                </div>
              </section>
            )}
            {grouped.done.length > 0 && (
              <section>
                <CardSectionHeader
                  icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />}
                  title="Hoàn thành" count={grouped.done.length} color="text-emerald-700"
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped.done.map((wo) => <WoCard key={wo.id} wo={wo} />)}
                </div>
              </section>
            )}
            {rows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-16 text-center">
                <Factory className="h-8 w-8 text-zinc-300" aria-hidden />
                <p className="text-sm font-medium text-zinc-700">Không có WO nào</p>
              </div>
            )}
          </div>
        ) : (
          /* ── Table view ── */
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
              <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2.5 text-left font-medium">Số WO</th>
                <th className="px-4 py-2.5 text-left font-medium">Đơn hàng</th>
                <th className="px-4 py-2.5 text-left font-medium">Ưu tiên</th>
                <th className="px-4 py-2.5 text-right font-medium">KH / Đạt</th>
                <th className="px-4 py-2.5 text-left font-medium">Tiến độ</th>
                <th className="px-4 py-2.5 text-left font-medium">Trạng thái</th>
                <th className="px-4 py-2.5 text-left font-medium">Ghi chú</th>
                <th className="w-20 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => {
                const planned = Number(r.plannedQty);
                const good = Number(r.goodQty);
                const pct = planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
                const cfg = STATUS_CONFIG[r.status];
                const pri = PRIORITY_CONFIG[r.priority] ?? PRIORITY_CONFIG.NORMAL!;
                return (
                  <tr
                    key={r.id}
                    className="group cursor-pointer transition-colors hover:bg-zinc-50/80"
                    onClick={() => { window.location.href = `/work-orders/${r.id}`; }}
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
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString("vi-VN") : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-700">{r.orderNo ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs font-medium", pri.color)}>{pri.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="tabular-nums text-sm font-semibold text-zinc-800">{planned}</span>
                      <span className="text-zinc-400"> / </span>
                      <span className={cn("tabular-nums text-sm font-semibold", good >= planned ? "text-emerald-600" : "text-zinc-600")}>
                        {good}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className={cn("absolute inset-y-0 left-0 rounded-full transition-all", pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-indigo-500" : "bg-zinc-300")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="min-w-[2.5rem] text-right text-[11px] tabular-nums text-zinc-600">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", cfg.bg, cfg.color, cfg.border)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} aria-hidden />
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
                        >
                          Chi tiết
                        </Link>
                        {(r.status === "IN_PROGRESS" || r.status === "RELEASED") && (
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

      {/* ── Pagination ── */}
      {urlState.view === "table" && (
        <footer className="flex h-10 items-center justify-between border-t border-zinc-200 bg-white px-4 text-xs text-zinc-600">
          <span>
            Trang <span className="tabular-nums">{urlState.page}/{pageCount}</span> · {total.toLocaleString("vi-VN")} WO
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={urlState.page <= 1}
              onClick={() => void setUrlState({ page: Math.max(1, urlState.page - 1) })}>‹</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page >= pageCount}
              onClick={() => void setUrlState({ page: Math.min(pageCount, urlState.page + 1) })}>›</Button>
          </div>
        </footer>
      )}
    </div>
  );
}

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function CardSectionHeader({ icon, title, count, color }: { icon: React.ReactNode; title: string; count: number; color: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className={cn("text-xs font-semibold uppercase tracking-wider", color)}>{title}</h2>
      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-600">{count}</span>
    </div>
  );
}
