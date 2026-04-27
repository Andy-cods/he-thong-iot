"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import { PO_STATUSES, PO_STATUS_LABELS, type POStatus } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { POListTable } from "@/components/procurement/POListTable";
import { PoExportDialog } from "@/components/procurement/PoExportDialog";
import { usePurchaseOrdersList, usePurchaseOrdersStats } from "@/hooks/usePurchaseOrders";
import type { POFilter } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtVND(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v) || v === 0) return "0 ₫";
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} tỷ ₫`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} tr ₫`;
  return `${Math.round(v).toLocaleString("vi-VN")} ₫`;
}

/* ── Status pill config ──────────────────────────────────────────────────── */

const PO_STATUS_PILL: Record<POStatus | "all", { cls: string; dot: string }> = {
  all:       { cls: "bg-zinc-900 text-white border-zinc-900",                                            dot: "bg-white" },
  DRAFT:     { cls: "bg-zinc-100 text-zinc-700 border-zinc-200 ring-zinc-200",                           dot: "bg-zinc-400" },
  SENT:      { cls: "bg-blue-50 text-blue-700 border-blue-200 ring-blue-200",                            dot: "bg-blue-500" },
  PARTIAL:   { cls: "bg-amber-50 text-amber-700 border-amber-200 ring-amber-200",                        dot: "bg-amber-500 animate-pulse" },
  RECEIVED:  { cls: "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-200",                dot: "bg-emerald-500" },
  CANCELLED: { cls: "bg-red-50 text-red-700 border-red-200 ring-red-200",                                dot: "bg-red-400" },
  CLOSED:    { cls: "bg-zinc-100 text-zinc-500 border-zinc-200 ring-zinc-200",                           dot: "bg-zinc-400" },
};

/* ── KPI Card ────────────────────────────────────────────────────────────── */

function KpiCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent: "indigo" | "emerald" | "amber" | "red" | "zinc";
}) {
  const map = {
    indigo:  { card: "bg-indigo-50/60 border-indigo-200",   icon: "bg-indigo-100 text-indigo-700",   value: "text-indigo-900"  },
    emerald: { card: "bg-emerald-50/60 border-emerald-200", icon: "bg-emerald-100 text-emerald-700", value: "text-emerald-900" },
    amber:   { card: "bg-amber-50/60 border-amber-200",     icon: "bg-amber-100 text-amber-700",     value: "text-amber-900"   },
    red:     { card: "bg-red-50/60 border-red-200",         icon: "bg-red-100 text-red-700",         value: "text-red-900"     },
    zinc:    { card: "bg-white border-zinc-200",            icon: "bg-zinc-100 text-zinc-600",       value: "text-zinc-900"    },
  };
  const s = map[accent];
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", s.card)}>
      <div className="flex items-start gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", s.icon)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
          <p className={cn("mt-1 font-mono text-xl font-bold leading-tight tabular-nums", s.value)}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Component ───────────────────────────────────────────────────────────── */

export function POTab() {
  const [urlState, setUrlState] = useQueryStates(
    {
      status: parseAsStringEnum(["all", ...PO_STATUSES]).withDefault("all"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
      q: parseAsString.withDefault(""),
      from: parseAsString.withDefault(""),
      to: parseAsString.withDefault(""),
    },
    { history: "replace", shallow: true },
  );

  const [searchInput, setSearchInput] = React.useState(urlState.q);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== urlState.q) void setUrlState({ q: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const filter: POFilter = React.useMemo(
    () => ({
      status: urlState.status === "all" ? undefined : [urlState.status as (typeof PO_STATUSES)[number]],
      page: urlState.page,
      pageSize: urlState.pageSize,
      q: urlState.q || undefined,
      from: urlState.from || undefined,
      to: urlState.to || undefined,
    }),
    [urlState],
  );

  const query = usePurchaseOrdersList(filter);
  // V3.2 — stats từ aggregate API thay vì compute trên page hiện tại
  const statsQuery = usePurchaseOrdersStats({
    q: urlState.q || undefined,
    from: urlState.from || undefined,
    to: urlState.to || undefined,
  });
  const stats = statsQuery.data?.data;

  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const isEmpty = !query.isLoading && rows.length === 0;
  const hasFilter =
    urlState.status !== "all" ||
    urlState.q !== "" ||
    urlState.from !== "" ||
    urlState.to !== "";

  const resetFilters = () => {
    setSearchInput("");
    void setUrlState({ status: "all", q: "", from: "", to: "", page: 1 });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50/30">

      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-5">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
            <Link href="/" className="hover:text-zinc-900 hover:underline">Tổng quan</Link>
            <span className="mx-1.5 text-zinc-300">›</span>
            <span className="text-zinc-500">Tài chính &amp; Mua bán</span>
            <span className="mx-1.5 text-zinc-300">›</span>
            <span className="font-medium text-zinc-900">Đặt hàng (PO)</span>
          </nav>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-900">
            <FileText className="h-6 w-6 text-indigo-600" aria-hidden />
            Đơn đặt hàng (PO)
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            <span className="font-semibold tabular-nums text-zinc-900">{(stats?.total ?? total).toLocaleString("vi-VN")}</span> PO trong hệ thống
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PoExportDialog />
          <Button asChild size="sm">
            <Link href="/procurement/purchase-orders/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tạo PO
            </Link>
          </Button>
        </div>
      </header>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-3 border-b border-zinc-200 bg-white px-6 py-4 lg:grid-cols-4">
        <KpiCard
          icon={TrendingUp}
          label="Tổng giá trị"
          value={fmtVND(stats?.totalSpend ?? 0)}
          sub={`${stats?.total ?? 0} PO`}
          accent="indigo"
        />
        <KpiCard
          icon={Clock}
          label="PO đang mở"
          value={String(stats?.openCount ?? 0)}
          sub={`${fmtVND(stats?.pendingSpend ?? 0)} chờ nhận`}
          accent="amber"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Đã hoàn tất"
          value={String(stats?.receivedCount ?? 0)}
          sub={`${fmtVND(stats?.receivedSpend ?? 0)} đã nhận`}
          accent="emerald"
        />
        <KpiCard
          icon={(stats?.overdueCount ?? 0) > 0 ? AlertTriangle : Users}
          label={(stats?.overdueCount ?? 0) > 0 ? "Quá hạn" : "Số NCC"}
          value={String((stats?.overdueCount ?? 0) > 0 ? stats?.overdueCount : (stats?.supplierCount ?? 0))}
          sub={(stats?.overdueCount ?? 0) > 0 ? "PO quá ETA chưa nhận đủ" : "nhà cung cấp"}
          accent={(stats?.overdueCount ?? 0) > 0 ? "red" : "zinc"}
        />
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-6 py-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm mã PO hoặc NCC..."
            className="h-9 w-64 rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", ...PO_STATUSES] as const).map((s) => {
            const active = urlState.status === s;
            const cfg = PO_STATUS_PILL[s];
            const count =
              s === "all" ? (stats?.total ?? 0) :
              s === "DRAFT" ? (stats?.total ?? 0) - (stats?.openCount ?? 0) - (stats?.receivedCount ?? 0) - (stats?.cancelledCount ?? 0) :
              s === "SENT" ? (stats?.sentCount ?? 0) :
              s === "PARTIAL" ? (stats?.partialCount ?? 0) :
              s === "RECEIVED" ? (stats?.receivedCount ?? 0) :
              s === "CANCELLED" ? (stats?.cancelledCount ?? 0) :
              0;
            return (
              <button
                key={s}
                type="button"
                onClick={() => void setUrlState({ status: s as typeof urlState.status, page: 1 })}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  active
                    ? cn(cfg.cls, "ring-1 ring-inset shadow-sm")
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", active ? cfg.dot : "bg-zinc-300")} aria-hidden />
                {s === "all" ? "Tất cả" : PO_STATUS_LABELS[s as POStatus]}
                {s !== "DRAFT" && (
                  <span className={cn("font-mono text-xs tabular-nums", active ? "opacity-80" : "text-zinc-400")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Date range */}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-zinc-600">
            <span className="text-zinc-500">Từ</span>
            <input
              type="date"
              value={urlState.from}
              onChange={(e) => void setUrlState({ from: e.target.value, page: 1 })}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600">
            <span className="text-zinc-500">Đến</span>
            <input
              type="date"
              value={urlState.to}
              onChange={(e) => void setUrlState({ to: e.target.value, page: 1 })}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Xoá lọc
            </Button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-hidden p-4">
        {isEmpty ? (
          hasFilter ? (
            <EmptyState
              preset="no-filter-match"
              title="Không có PO khớp bộ lọc"
              description="Thử điều chỉnh từ khoá hoặc xoá bộ lọc."
              actions={
                <Button variant="ghost" size="sm" onClick={resetFilters}>Xoá bộ lọc</Button>
              }
            />
          ) : (
            <EmptyState
              preset="no-bom"
              title="Chưa có PO nào"
              description="Tạo PO thủ công hoặc convert từ PR đã APPROVED."
              actions={
                <Button asChild size="sm">
                  <Link href="/procurement/purchase-orders/new">Tạo PO</Link>
                </Button>
              }
            />
          )
        ) : (
          <POListTable rows={rows} loading={query.isLoading} />
        )}
      </div>

      {/* ── Footer pagination ── */}
      {!isEmpty && (
        <footer className="flex h-11 items-center justify-between border-t border-zinc-200 bg-white px-6 text-sm text-zinc-600">
          <div className="tabular-nums">
            Trang <span className="font-semibold text-zinc-900">{urlState.page}</span> / {pageCount}
            <span className="mx-2 text-zinc-300">·</span>
            <span className="text-zinc-500">{total.toLocaleString("vi-VN")} PO</span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={urlState.page <= 1}
              onClick={() => void setUrlState({ page: 1 })}>‹‹</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page <= 1}
              onClick={() => void setUrlState({ page: Math.max(1, urlState.page - 1) })}>‹</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page >= pageCount}
              onClick={() => void setUrlState({ page: Math.min(pageCount, urlState.page + 1) })}>›</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page >= pageCount}
              onClick={() => void setUrlState({ page: pageCount })}>››</Button>
          </div>
        </footer>
      )}
    </div>
  );
}
