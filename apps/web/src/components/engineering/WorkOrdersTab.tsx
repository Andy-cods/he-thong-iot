"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { QueryError } from "@/components/ui/query-error";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, StatTile, type DataTableColumn } from "@/components/ui/data-table";
import { useWorkOrdersList, type WorkOrderStatus, type WorkOrderRow } from "@/hooks/useWorkOrders";
import type { WorkOrderFilter } from "@/lib/query-keys";
import { BomFilterChip } from "@/components/bom/BomFilterChip";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-badge";
import { TONE_CLASSES, getStatus, statusLabel } from "@/lib/status";
import { formatDate } from "@/lib/format";

/* ─── Status / Priority config ─────────────────────────────────────────── */

// V4.1 UI-07: bỏ STATUS_CONFIG cục bộ ("Nháp" cho DRAFT, "Đã hủy" đỏ, Đang SX cam) —
// nhãn + tông lấy từ lib/status.ts domain "wo" (DRAFT = "Chờ duyệt", Đã huỷ = xám).

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW:    { label: "Thấp",       color: "text-zinc-500 dark:text-zinc-400"   },
  // V4.1 UI-24: bỏ xanh/cam trang trí — chỉ Cao (amber) / Khẩn cấp (đỏ) mang màu.
  NORMAL: { label: "Bình thường",color: "text-zinc-600 dark:text-zinc-400"   },
  HIGH:   { label: "Cao",        color: "text-amber-700 dark:text-amber-400" },
  URGENT: { label: "Khẩn cấp",  color: "text-red-600 dark:text-red-400"    },
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
      <span className={cn("absolute inset-0 flex items-center justify-center font-mono text-xs font-bold tabular-nums", pct >= 100 ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-300")}>
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
  const pri = PRIORITY_CONFIG[wo.priority] ?? PRIORITY_CONFIG.NORMAL!;

  return (
    <Link
      href={`/work-orders/${wo.id}`}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border bg-white p-4 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 dark:bg-zinc-900",
        isDone    ? "border-emerald-200 bg-emerald-50/30 hover:border-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/40 dark:hover:border-emerald-600" :
        isPaused  ? "border-amber-200 hover:border-amber-400 dark:border-amber-800 dark:hover:border-amber-600" :
                    "border-zinc-200 hover:border-indigo-300 dark:border-zinc-700 dark:hover:border-indigo-700",
      )}
    >
      {/* Row 1: ring + WO info */}
      <div className="flex items-center gap-3">
        <ProgressRing pct={pct} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-50">{wo.woNo}</code>
            <StatusPill domain="wo" code={wo.status} dot />
          </div>
          {/* V4.1 SX-33/Q4 — hiện Sản phẩm thay "Đơn hàng" (đơn hàng bán đang ẩn). */}
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400" title={wo.productName ?? undefined}>
            <span className="font-mono text-zinc-700 dark:text-zinc-300">{wo.productSku ?? "—"}</span>
            {wo.productName ? ` · ${wo.productName}` : ""}
          </p>
        </div>
      </div>

      {/* Row 2: qty */}
      <div className="flex items-baseline justify-between text-xs">
        <span>
          <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{good}</span>
          <span className="text-zinc-400 dark:text-zinc-500"> / {planned} cái</span>
        </span>
        {remaining > 0 ? (
          <span className="text-amber-700 dark:text-amber-400">Còn <strong className="tabular-nums">{remaining}</strong></span>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400">Đủ SL</span>
        )}
      </div>

      {/* Row 3: priority + CTA */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-2 text-xs dark:border-zinc-800">
        <span className={cn("font-medium", pri.color)}>{pri.label}</span>
        <span className={cn("inline-flex items-center gap-1 font-medium transition-colors",
          isPaused ? "text-amber-600 group-hover:text-amber-700 dark:text-amber-400 dark:group-hover:text-amber-300" : "text-indigo-600 group-hover:text-indigo-700 dark:text-indigo-400 dark:group-hover:text-indigo-300"
        )}>
          {isPaused ? (
            <><Pause className="h-3 w-3" aria-hidden />Tiếp tục</>
          ) : isDone ? (
            <><CheckCircle2 className="h-3 w-3" aria-hidden />Xem lại</>
          ) : (
            <><Wrench className="h-3 w-3" aria-hidden />Xem lệnh →</>
          )}
        </span>
      </div>
    </Link>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

export interface WorkOrdersTabProps {
  /**
   * V3.7.47 — variant của tab:
   *  - "engineering" (default): hiển thị YÊU CẦU sản xuất (DRAFT) — TK-A
   *    đã tạo, chờ Gia công duyệt.
   *  - "operations-requests": dành cho VH-A xem yêu cầu chờ duyệt (DRAFT).
   *  - "operations-orders": dành cho VH-A xem lệnh SX đã duyệt + đang chạy.
   */
  variant?: "engineering" | "operations-requests" | "operations-orders";
}

export function WorkOrdersTab({ variant = "engineering" }: WorkOrdersTabProps = {}) {
  // V3.7.47 — Default status filter theo variant.
  const defaultStatus =
    variant === "operations-orders"
      ? "active"
      : variant === "operations-requests"
        ? "DRAFT"
        : "DRAFT"; // engineering: tab "Yêu cầu SX" → DRAFT

  const [urlState, setUrlState] = useQueryStates(
    {
      q:            parseAsString.withDefault(""),
      status:       parseAsString.withDefault(defaultStatus),
      bomTemplateId:parseAsString.withDefault(""),
      view:         parseAsString.withDefault("table"),
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

  const query = useWorkOrdersList(filter);
  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));

  // V4.1 SX-29 — KPI từ `meta.statusCounts` (server GROUP BY trên TOÀN bộ WO
  // khớp tìm kiếm/BOM, không theo trạng thái) thay vì đếm 200 dòng đầu.
  const statusCounts = query.data?.meta.statusCounts;
  const stats = React.useMemo(() => {
    const c = statusCounts ?? {};
    const n = (k: WorkOrderStatus) => c[k] ?? 0;
    return {
      total: Object.values(c).reduce((a, b) => a + (b ?? 0), 0),
      inProgress: n("IN_PROGRESS"),
      queued: n("QUEUED") + n("RELEASED"),
      completed: n("COMPLETED"),
      draft: n("DRAFT"),
    };
  }, [statusCounts]);

  // Group cho card view
  const grouped = React.useMemo(() => ({
    inProg:  rows.filter((r) => r.status === "IN_PROGRESS"),
    paused:  rows.filter((r) => r.status === "PAUSED"),
    waiting: rows.filter((r) => r.status === "QUEUED" || r.status === "RELEASED"),
    draft:   rows.filter((r) => r.status === "DRAFT"),
    done:    rows.filter((r) => r.status === "COMPLETED"),
  }), [rows]);

  // V4.1 UI-07/08: chip lọc lấy nhãn từ lib/status.ts (khớp badge trong bảng).
  // Biến thể "yêu cầu" (Thiết kế + Gia công) đặt "Chờ duyệt" (DRAFT) lên đầu và
  // "Tất cả" ngay sau để xem mọi trạng thái.
  const isRequestVariant = variant !== "operations-orders";
  const chipCodes = isRequestVariant
    ? (["DRAFT", "all", "active", "IN_PROGRESS", "QUEUED", "RELEASED", "PAUSED", "COMPLETED"] as const)
    : (["active", "all", "IN_PROGRESS", "QUEUED", "RELEASED", "PAUSED", "COMPLETED", "DRAFT"] as const);
  const STATUS_CHIPS = chipCodes.map((value) => ({
    value,
    label:
      value === "active" ? "Đang hoạt động" : value === "all" ? "Tất cả" : statusLabel("wo", value),
  }));
  const currentFilterLabel =
    STATUS_CHIPS.find((c) => c.value === urlState.status)?.label ?? urlState.status;
  // V4.1 UI-08 (§2.2): tiêu đề đúng với bộ lọc đang áp dụng (trước đây luôn ghi
  // "chờ duyệt" kể cả khi đang xem mọi trạng thái).
  const showingPendingOnly = urlState.status === "DRAFT";

  const router = useRouter();
  const woColumns = React.useMemo<DataTableColumn<WorkOrderRow>[]>(
    () => [
      {
        id: "woNo",
        header: "Số lệnh",
        kind: "code",
        mobile: "primary",
        width: 150,
        cell: (r) => (
          <Link
            href={`/work-orders/${r.id}`}
            className="font-mono text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            title={r.woNo}
          >
            {r.woNo}
          </Link>
        ),
      },
      {
        id: "product",
        header: "Sản phẩm",
        // V4.1 SX-33 — cột Sản phẩm thay "Đơn hàng" (Q4).
        cell: (r) => (
          <div className="min-w-0 max-w-[16rem]">
            <span className="block truncate font-mono text-xs text-zinc-700 dark:text-zinc-300" title={r.productSku ?? undefined}>
              {r.productSku ?? "—"}
            </span>
            {r.productName ? (
              <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400" title={r.productName}>
                {r.productName}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "priority",
        header: "Ưu tiên",
        width: 110,
        cell: (r) => {
          const pri = PRIORITY_CONFIG[r.priority] ?? PRIORITY_CONFIG.NORMAL!;
          return <span className={cn("text-xs font-medium", pri.color)}>{pri.label}</span>;
        },
      },
      {
        id: "qty",
        header: "Đạt / KH",
        kind: "number",
        width: 110,
        cell: (r) => {
          const planned = Number(r.plannedQty);
          const good = Number(r.goodQty);
          return (
            <span>
              <span className={cn("font-semibold", good >= planned ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-800 dark:text-zinc-200")}>
                {good.toLocaleString("vi-VN")}
              </span>
              <span className="text-zinc-400 dark:text-zinc-500"> / {planned.toLocaleString("vi-VN")}</span>
            </span>
          );
        },
      },
      {
        id: "progress",
        header: "Tiến độ",
        width: 140,
        mobile: "hide",
        cell: (r) => {
          const planned = Number(r.plannedQty);
          const good = Number(r.goodQty);
          const pct = planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
          return (
            <div className="flex items-center gap-2">
              <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className={cn("absolute inset-y-0 left-0 rounded-full", pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-indigo-500" : "bg-zinc-300")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="min-w-[2.5rem] text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400">{pct}%</span>
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Trạng thái",
        kind: "status",
        width: 140,
        cell: (r) => <StatusPill domain="wo" code={r.status} dot pulse={r.status === "IN_PROGRESS"} />,
      },
      {
        id: "created",
        header: "Ngày tạo",
        kind: "date",
        width: 110,
        cell: (r) => (r.createdAt ? formatDate(r.createdAt, "dd/MM/yyyy") : "—"),
      },
      {
        id: "notes",
        header: "Ghi chú",
        mobile: "hide",
        hideBelowLg: true,
        cell: (r) => (
          <span className="block max-w-[14rem] truncate text-xs text-zinc-500 dark:text-zinc-400" title={r.notes ?? undefined}>
            {r.notes ?? "—"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Header + Stats ── */}
      <header className="border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 sm:flex">
              <Factory className="h-5 w-5 text-zinc-500 dark:text-zinc-400" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {variant === "operations-orders"
                  ? "Lệnh sản xuất"
                  : variant === "operations-requests" && showingPendingOnly
                    ? "Yêu cầu sản xuất chờ duyệt"
                    : "Yêu cầu sản xuất"}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {variant === "operations-orders"
                  ? "Lệnh đã được duyệt — đang/đã sản xuất"
                  : variant === "operations-requests"
                    ? showingPendingOnly
                      ? "Yêu cầu từ Bộ phận Thiết kế đang chờ Gia công duyệt · chọn “Tất cả” để xem mọi trạng thái"
                      : `Yêu cầu từ Bộ phận Thiết kế · đang xem: ${currentFilterLabel}`
                    : showingPendingOnly
                      ? "Yêu cầu Thiết kế gửi sang Gia công, đang chờ duyệt"
                      : `Yêu cầu Thiết kế gửi sang Gia công · đang xem: ${currentFilterLabel}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* V3.7.73 — Đã bỏ "Tạo nhanh" demo. Mọi LSX dùng form chính thức GTAM. */}
            <Button asChild size="sm" title="Phiếu LSX GTAM — biểu mẫu chuẩn đủ quy trình + NVL + dao cụ + in A4">
              <Link href="/work-orders/new-lsx">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Phiếu LSX GTAM
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats — V4.1 UI-24 (X8): thẻ trung tính, bỏ nền cam/lam/lục. */}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatTile
            icon={isRequestVariant ? Clock : TrendingUp}
            label={isRequestVariant ? statusLabel("wo", "DRAFT") : "Tổng lệnh"}
            value={query.isLoading || query.isError ? "—" : isRequestVariant ? stats.draft : stats.total}
          />
          <StatTile icon={Activity} label="Đang sản xuất" value={query.isLoading || query.isError ? "—" : stats.inProgress} />
          <StatTile icon={Clock} label="Hàng đợi / Đã duyệt" value={query.isLoading || query.isError ? "—" : stats.queued} />
          <StatTile icon={CheckCircle2} label="Hoàn thành" value={query.isLoading || query.isError ? "—" : stats.completed} />
        </div>
      </header>

      {/* ── BOM filter chip ── */}
      {urlState.bomTemplateId ? (
        <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-800/60">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Lọc theo BOM:</span>
          <BomFilterChip
            bomTemplateId={urlState.bomTemplateId}
            onDismiss={() => void setUrlState({ bomTemplateId: "", page: 1 })}
          />
        </div>
      ) : null}

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/60">
        <Input
          placeholder="Tìm số lệnh, ghi chú…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="h-8 max-w-[200px]"
        />

        {/* Status chips */}
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_CHIPS.map((opt) => {
            const isStatusCode = opt.value !== "active" && opt.value !== "all";
            const tone = isStatusCode ? TONE_CLASSES[getStatus("wo", opt.value).tone] : null;
            const isActive = urlState.status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => void setUrlState({ status: opt.value, page: 1 })}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  isActive
                    ? tone
                      ? cn("border-transparent ring-1 ring-inset", tone.pill)
                      : "border-zinc-800 bg-zinc-900 text-white dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500",
                )}
              >
                {tone && <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", tone.dot)} aria-hidden />}
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* View toggle — right side */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => void setUrlState({ view: "table" })}
            className={cn("rounded-md p-1.5 transition-colors", urlState.view === "table" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800")}
            title="Dạng bảng"
          >
            <List className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void setUrlState({ view: "card" })}
            className={cn("rounded-md p-1.5 transition-colors", urlState.view === "card" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800")}
            title="Dạng thẻ"
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
        ) : query.isError ? (
          /* V4.1 SX-31 — lỗi tải hiện rõ, không giả làm "chưa có lệnh".
             V4.1 UI-05: dùng khối QueryError chung (thông điệp theo mã 429/403/5xx). */
          <QueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Không tải được danh sách lệnh sản xuất"
          />
        ) : rows.length === 0 &&
          (urlState.status !== "all" || urlState.q || urlState.bomTemplateId) ? (
          /* V4.1 UI-WO: KPI "Tổng WO 2" nhưng danh sách báo "Chưa có lệnh sản
             xuất nào" vì bộ lọc mặc định (Nháp/Đang hoạt động). Phân biệt
             "không khớp bộ lọc" với "chưa có dữ liệu". */
          <div className="p-4">
            <EmptyState
              preset="no-filter-match"
              title={
                urlState.status !== "all"
                  ? `Không có lệnh ở trạng thái "${currentFilterLabel}"`
                  : "Không có lệnh khớp bộ lọc"
              }
              description={
                stats.total > 0
                  ? `Có ${stats.total} lệnh sản xuất ở trạng thái khác.`
                  : "Thử bỏ bộ lọc hoặc từ khoá tìm kiếm."
              }
              actions={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearchInput("");
                    void setUrlState({ status: "all", q: "", bomTemplateId: "", page: 1 });
                  }}
                >
                  Xem tất cả lệnh
                </Button>
              }
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              preset="no-data"
              title="Chưa có lệnh sản xuất nào"
              description="Lập phiếu LSX mới, hoặc gửi yêu cầu sản xuất từ dòng BOM (nút GTAM)."
              actions={
                <Button asChild size="sm">
                  <Link href="/work-orders/new-lsx">
                    <Plus className="h-3.5 w-3.5" />
                    Phiếu LSX mới
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
                  icon={<span className={cn("h-2 w-2 animate-pulse rounded-full", TONE_CLASSES.progress.dot)} />}
                  title={statusLabel("wo", "IN_PROGRESS")} count={grouped.inProg.length} color={TONE_CLASSES.progress.text}
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
                  title={statusLabel("wo", "PAUSED")} count={grouped.paused.length} color="text-amber-700 dark:text-amber-400"
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
                  title="Hàng đợi / Đã duyệt" count={grouped.waiting.length} color="text-indigo-700 dark:text-indigo-400"
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped.waiting.map((wo) => <WoCard key={wo.id} wo={wo} />)}
                </div>
              </section>
            )}
            {grouped.draft.length > 0 && (
              <section>
                <CardSectionHeader
                  icon={<span className={cn("h-2 w-2 rounded-full", TONE_CLASSES.info.dot)} />}
                  title={statusLabel("wo", "DRAFT")} count={grouped.draft.length} color={TONE_CLASSES.info.text}
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
                  title={statusLabel("wo", "COMPLETED")} count={grouped.done.length} color="text-emerald-700 dark:text-emerald-400"
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped.done.map((wo) => <WoCard key={wo.id} wo={wo} />)}
                </div>
              </section>
            )}
            {rows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-16 text-center dark:border-zinc-700 dark:bg-zinc-800/60">
                <Factory className="h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Không có lệnh sản xuất nào</p>
              </div>
            )}
          </div>
        ) : (
          /* ── Table view ── V4.1 UI-11 (Đợt 6C): ui/data-table — header thẳng cột,
             số canh phải, điện thoại dạng thẻ (số lệnh + trạng thái, SP, Đạt/KH). */
          <div className="h-full p-4">
            <DataTable
              className="max-h-full"
              columns={woColumns}
              rows={rows}
              getRowKey={(r) => r.id}
              ariaLabel="Danh sách lệnh sản xuất"
              minWidth={900}
              onRowClick={(r) => router.push(`/work-orders/${r.id}`)}
            />
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {urlState.view === "table" && (
        <footer className="flex h-10 items-center justify-between border-t border-zinc-200 bg-white px-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          <span>
            Trang <span className="tabular-nums">{urlState.page}/{pageCount}</span> · {total.toLocaleString("vi-VN")} lệnh
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
      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{count}</span>
    </div>
  );
}
