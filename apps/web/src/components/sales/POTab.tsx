"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
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
import { PO_STATUSES } from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
import { POListTable } from "@/components/procurement/POListTable";
import { PoExportDialog } from "@/components/procurement/PoExportDialog";
import { usePurchaseOrdersList, usePurchaseOrdersStats } from "@/hooks/usePurchaseOrders";
import type { POFilter } from "@/lib/query-keys";
import { formatMoneyShort } from "@/lib/format";
import { TONE_CLASSES, statusOptions } from "@/lib/status";
import { cn } from "@/lib/utils";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

// V4.1 UI-13: KPI dùng tiền rút gọn chung "1,5 tr ₫" (dấu PHẨY — trước là "1.5 tr ₫").
const fmtVND = formatMoneyShort;

/* ── Status chips ────────────────────────────────────────────────────────── */

// V4.1 UI-07/08: nhãn + tông chip lọc lấy từ lib/status (bỏ PO_STATUS_PILL cục bộ).
const PO_STATUS_CHIPS = statusOptions("po");
const CHIP_ALL_ACTIVE =
  "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100";

/* ── KPI Card ────────────────────────────────────────────────────────────── */

function KpiCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent: "indigo" | "emerald" | "amber" | "red" | "zinc";
}) {
  const map = {
    indigo:  { card: "bg-indigo-50/60 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800",   icon: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400",   value: "text-indigo-900 dark:text-indigo-200"  },
    emerald: { card: "bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800", icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400", value: "text-emerald-900 dark:text-emerald-200" },
    amber:   { card: "bg-amber-50/60 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800",     icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",     value: "text-amber-900 dark:text-amber-200"   },
    red:     { card: "bg-red-50/60 border-red-200 dark:bg-red-950/40 dark:border-red-800",         icon: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",         value: "text-red-900 dark:text-red-200"     },
    zinc:    { card: "bg-white border-zinc-200 dark:bg-zinc-900 dark:border-zinc-700",            icon: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",       value: "text-zinc-900 dark:text-zinc-50"    },
  };
  const s = map[accent];
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", s.card)}>
      <div className="flex items-start gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", s.icon)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</p>
          <p className={cn("mt-1 text-xl font-bold leading-tight tabular-nums", s.value)}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>}
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
      // V4.1 Đợt 2 — link "PO quá hạn" ở Tổng quan (`?overdue=1`).
      overdue: parseAsString.withDefault(""),
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

  const overdueOnly = urlState.overdue === "1" || urlState.overdue === "true";
  const filter: POFilter = React.useMemo(
    () => ({
      status: urlState.status === "all" ? undefined : [urlState.status as (typeof PO_STATUSES)[number]],
      page: urlState.page,
      pageSize: urlState.pageSize,
      q: urlState.q || undefined,
      from: urlState.from || undefined,
      to: urlState.to || undefined,
      overdue: overdueOnly || undefined,
    }),
    [urlState, overdueOnly],
  );

  const query = usePurchaseOrdersList(filter);
  // V3.2 — stats từ aggregate API thay vì compute trên page hiện tại
  const statsQuery = usePurchaseOrdersStats({
    q: urlState.q || undefined,
    from: urlState.from || undefined,
    to: urlState.to || undefined,
  });
  const stats = statsQuery.data?.data;
  // V4.1 UI-05: stats lỗi → KPI hiện "—" thay vì 0.
  const statsFailed = statsQuery.isError && !stats;
  const kpi = (v: string) => (statsFailed ? "—" : v);

  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  // V4.1 UI-05: lỗi API không được coi là "chưa có PO".
  const showError = query.isError && rows.length === 0;
  const isEmpty = !query.isLoading && !query.isError && rows.length === 0;
  const hasFilter =
    urlState.status !== "all" ||
    urlState.q !== "" ||
    urlState.from !== "" ||
    urlState.to !== "" ||
    overdueOnly;

  const resetFilters = () => {
    setSearchInput("");
    void setUrlState({ status: "all", q: "", from: "", to: "", overdue: "", page: 1 });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/30">

      {/* ── Header ── */}
      {/* V4.1 UI-X6: header chuẩn flex-wrap + min-w-0 — điện thoại nút xuống dòng, không tràn/gãy chữ. */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div className="min-w-0 flex-1 basis-56">
          <Breadcrumb
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Bộ phận Thu mua" },
              { label: "Đặt hàng (PO)" },
            ]}
          />
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Đơn đặt hàng (PO)
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{(stats?.total ?? total).toLocaleString("vi-VN")}</span> PO trong hệ thống
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PoExportDialog />
          <Button asChild size="sm">
            <Link href="/procurement/purchase-orders/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="whitespace-nowrap">Tạo PO</span>
            </Link>
          </Button>
        </div>
      </header>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6 lg:grid-cols-4">
        <KpiCard
          icon={TrendingUp}
          label="Tổng giá trị"
          value={kpi(fmtVND(stats?.totalSpend ?? 0))}
          sub={kpi(`${stats?.total ?? 0} PO`)}
          accent="indigo"
        />
        <KpiCard
          icon={Clock}
          label="PO đang mở"
          value={kpi(String(stats?.openCount ?? 0))}
          sub={kpi(`${fmtVND(stats?.pendingSpend ?? 0)} chờ nhận`)}
          accent="amber"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Đã hoàn tất"
          value={kpi(String(stats?.receivedCount ?? 0))}
          sub={kpi(`${fmtVND(stats?.receivedSpend ?? 0)} đã nhận`)}
          accent="emerald"
        />
        <KpiCard
          icon={(stats?.overdueCount ?? 0) > 0 ? AlertTriangle : Users}
          label={(stats?.overdueCount ?? 0) > 0 ? "Quá hạn" : "Số NCC"}
          value={kpi(String((stats?.overdueCount ?? 0) > 0 ? stats?.overdueCount : (stats?.supplierCount ?? 0)))}
          sub={(stats?.overdueCount ?? 0) > 0 ? "PO quá ngày dự kiến chưa nhận đủ" : "nhà cung cấp"}
          accent={(stats?.overdueCount ?? 0) > 0 ? "red" : "zinc"}
        />
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        {/* Search */}
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" aria-hidden />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm mã PO hoặc NCC..."
            className="h-9 w-full rounded-lg border sm:w-64 border-zinc-200 bg-white pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
          />
        </div>

        {/* Status pills — V4.1 UI-X6: điện thoại 1 dòng cuộn ngang (từng gãy 4 dòng). */}
        <div className="flex w-full min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] sm:w-auto sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
          {(["all", ...PO_STATUSES] as const).map((s) => {
            const active = urlState.status === s;
            const opt = s === "all" ? null : PO_STATUS_CHIPS.find((o) => o.code === s);
            const tone = opt ? TONE_CLASSES[opt.tone] : null;
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
                    ? tone
                      ? cn(tone.pill, "border-transparent ring-1 ring-inset shadow-sm")
                      : cn(CHIP_ALL_ACTIVE, "shadow-sm")
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    active ? (tone ? tone.dot : "bg-white dark:bg-zinc-900") : "bg-zinc-300 dark:bg-zinc-600",
                  )}
                  aria-hidden
                />
                {opt ? opt.label : "Tất cả"}
                {s !== "DRAFT" && (
                  <span className={cn("text-xs tabular-nums", active ? "opacity-80" : "text-zinc-400 dark:text-zinc-500")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* V4.1 Đợt 2 — lọc PO quá hạn ETA (bật từ Tổng quan hoặc bấm tại đây). */}
        <button
          type="button"
          onClick={() => void setUrlState({ overdue: overdueOnly ? "" : "1", page: 1 })}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
            // V4.1 UI-07: "Quá hạn" = tông warning (không đỏ).
            overdueOnly
              ? cn(TONE_CLASSES.warning.pill, "border-transparent ring-1 ring-inset")
              : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
          )}
          aria-pressed={overdueOnly}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Quá hạn giao
          <span className="text-xs tabular-nums opacity-80">{stats?.overdueCount ?? 0}</span>
        </button>

        {/* Date range */}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="text-zinc-500 dark:text-zinc-400">Từ</span>
            <input
              type="date"
              value={urlState.from}
              onChange={(e) => void setUrlState({ from: e.target.value, page: 1 })}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="text-zinc-500 dark:text-zinc-400">Đến</span>
            <input
              type="date"
              value={urlState.to}
              onChange={(e) => void setUrlState({ to: e.target.value, page: 1 })}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
        {showError ? (
          <QueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Không tải được danh sách PO"
          />
        ) : isEmpty ? (
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
      {!isEmpty && !showError && (
        <footer className="flex h-11 items-center justify-between border-t border-zinc-200 bg-white px-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          <div className="tabular-nums">
            Trang <span className="font-semibold text-zinc-900 dark:text-zinc-50">{urlState.page}</span> / {pageCount}
            <span className="mx-2 text-zinc-300 dark:text-zinc-600">·</span>
            <span className="text-zinc-500 dark:text-zinc-400">{total.toLocaleString("vi-VN")} PO</span>
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
