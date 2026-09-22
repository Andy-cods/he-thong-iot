"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  MoreVertical,
  Package,
  RefreshCw,
  Search,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  usePurchaseOrdersList,
  usePurchaseOrdersStats,
  type PORow,
} from "@/hooks/usePurchaseOrders";
import {
  useApproveReceiving,
  useRejectReceiving,
} from "@/hooks/useReceivingApprove";
import { cn } from "@/lib/utils";
import { ReceivingHistoryDrawer } from "./ReceivingHistoryDrawer";

/**
 * Wave 5 Phase B — `<ReceivingMovementView>` (trước đây `ReceivingTab`).
 *
 * Redesign theo feedback user "Nhận hàng đang bị xấu và chiếm space không
 * hợp lí": POCard cao ~6 khối → bảng compact (nhất quán `POListTable`), 5 nút
 * hành động → 1 hành động chính (mở wizard) + menu phụ (dropdown).
 *
 * Header/segmented-control dùng chung đã chuyển lên `<MovementTab>` — view
 * này chỉ còn KPI + filter + bảng/card.
 */

function supplierLabel(po: PORow): string {
  return po.supplierName ?? po.supplierCode ?? "Nhà cung cấp chưa gán";
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr).getTime();
  if (!Number.isFinite(d)) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now.getTime()) / 86400000);
}

function fmtVND(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "0";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "0";
  return Math.round(num).toLocaleString("vi-VN");
}

/* ── KPI Card ────────────────────────────────────────────────────────────── */

function KpiCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent: "indigo" | "amber" | "red" | "emerald" | "zinc";
}) {
  const map = {
    indigo:  { card: "bg-indigo-50/70 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800",   icon: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400",   value: "text-indigo-900 dark:text-indigo-200"  },
    amber:   { card: "bg-amber-50/70 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800",     icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",     value: "text-amber-900 dark:text-amber-200"   },
    red:     { card: "bg-red-50/70 border-red-200 dark:bg-red-950/40 dark:border-red-800",         icon: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",         value: "text-red-900 dark:text-red-200"     },
    emerald: { card: "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800", icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400", value: "text-emerald-900 dark:text-emerald-200" },
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
          <p className={cn("mt-1 font-mono text-xl font-bold leading-tight tabular-nums", s.value)}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

/* ── ETA badge ───────────────────────────────────────────────────────────── */

function EtaBadge({ eta }: { eta: string | null | undefined }) {
  const days = daysUntil(eta);
  const overdue = days !== null && days < 0;
  const isToday = days === 0;
  const soon = days !== null && days > 0 && days <= 3;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
        overdue ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400" :
        isToday ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" :
        soon ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" :
        "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      )}
      title={eta ? `ETA ${eta}` : "Chưa có ETA"}
    >
      {overdue ? <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden /> : null}
      {eta ?? "—"}
      {overdue ? ` (quá ${Math.abs(days!)}d)` : isToday ? " (hôm nay)" : ""}
    </span>
  );
}

/* ── Progress mini bar ───────────────────────────────────────────────────── */

function ReceivingProgress({ po }: { po: PORow }) {
  const ordered = Number(po.totalAmount ?? 0);
  const isPartial = po.status === "PARTIAL";
  // PORow không expose received/ordered qty tổng hợp; dùng status làm proxy
  // trực quan (không có số liệu chính xác % ở list API — tránh bịa số).
  const pct = po.status === "RECEIVED" || po.status === "CLOSED" ? 100 : isPartial ? 50 : 0;
  return (
    <div className="flex items-center gap-2" title={`Trạng thái: ${po.status}`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-600",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{pct}%</span>
      {ordered > 0 ? null : null}
    </div>
  );
}

/* ── Row actions menu ────────────────────────────────────────────────────── */

function RowActionsMenu({
  po,
  onApprove,
  onReject,
  onHistory,
}: {
  po: PORow;
  onApprove: () => void;
  onReject: () => void;
  onHistory: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          title="Thao tác khác"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onHistory}>
          <History className="h-3.5 w-3.5" aria-hidden />
          Lịch sử nhận hàng
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onApprove}>
          <Check className="h-3.5 w-3.5" aria-hidden />
          Duyệt nhận đủ
        </DropdownMenuItem>
        <DropdownMenuItem variant="danger" onClick={onReject}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Từ chối
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Compact table (desktop, ≥ md) ───────────────────────────────────────── */

function ReceivingTable({
  rows,
  onApprove,
  onReject,
  onHistory,
}: {
  rows: PORow[];
  onApprove: (po: PORow) => void;
  onReject: (po: PORow) => void;
  onHistory: (po: PORow) => void;
}) {
  const router = useRouter();
  const gridCols =
    "grid-cols-[140px_minmax(0,1fr)_110px_100px_130px_120px_44px]";

  return (
    <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:block">
      <div
        className={cn(
          "grid h-11 items-center border-b border-zinc-200 bg-zinc-50/80 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400",
          gridCols,
        )}
      >
        <div>Mã PO</div>
        <div>Nhà cung cấp</div>
        <div>ETA</div>
        <div>Tiến độ</div>
        <div className="text-right">Giá trị</div>
        <div>Trạng thái</div>
        <div />
      </div>
      <div>
        {rows.map((po) => {
          const isPartial = po.status === "PARTIAL";
          return (
            <div
              key={po.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/receiving/${po.id}/wizard`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/receiving/${po.id}/wizard`);
              }}
              className={cn(
                "group grid h-14 cursor-pointer items-center border-b border-zinc-50 px-4 transition-colors hover:bg-indigo-50/30 dark:border-zinc-800/50 dark:hover:bg-indigo-500/10",
                gridCols,
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Package className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden />
                <span className="truncate font-mono text-sm font-bold text-indigo-600 group-hover:underline dark:text-indigo-400">
                  {po.poNo}
                </span>
              </div>
              <span className="truncate pr-3 text-sm text-zinc-800 dark:text-zinc-200">
                {supplierLabel(po)}
              </span>
              <EtaBadge eta={po.expectedEta} />
              <ReceivingProgress po={po} />
              <span className="text-right font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                {po.totalAmount ? `${fmtVND(po.totalAmount)} ₫` : "—"}
              </span>
              <span className={cn(
                "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                isPartial
                  ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800"
                  : "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:ring-blue-800",
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", isPartial ? "bg-amber-500 animate-pulse" : "bg-blue-500")} />
                {isPartial ? "Đang nhận" : "Chờ xử lý"}
              </span>
              <div onClick={(e) => e.stopPropagation()}>
                <RowActionsMenu
                  po={po}
                  onApprove={() => onApprove(po)}
                  onReject={() => onReject(po)}
                  onHistory={() => onHistory(po)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Mobile card fallback (< md) ─────────────────────────────────────────── */

function ReceivingCardList({
  rows,
  onApprove,
  onReject,
  onHistory,
}: {
  rows: PORow[];
  onApprove: (po: PORow) => void;
  onReject: (po: PORow) => void;
  onHistory: (po: PORow) => void;
}) {
  return (
    <div className="flex flex-col gap-2 md:hidden">
      {rows.map((po) => {
        const isPartial = po.status === "PARTIAL";
        return (
          <Link
            key={po.id}
            href={`/receiving/${po.id}/wizard`}
            className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800/60"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Package className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden />
                <span className="truncate font-mono text-sm font-bold text-zinc-900 dark:text-zinc-50">{po.poNo}</span>
              </div>
              <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <RowActionsMenu
                  po={po}
                  onApprove={() => onApprove(po)}
                  onReject={() => onReject(po)}
                  onHistory={() => onHistory(po)}
                />
              </div>
            </div>
            <p className="truncate text-sm text-zinc-700 dark:text-zinc-300">{supplierLabel(po)}</p>
            <div className="flex items-center justify-between gap-2">
              <span className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                isPartial
                  ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800"
                  : "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:ring-blue-800",
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", isPartial ? "bg-amber-500 animate-pulse" : "bg-blue-500")} />
                {isPartial ? "Đang nhận" : "Chờ xử lý"}
              </span>
              <EtaBadge eta={po.expectedEta} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

function ReceivingTableSkeleton() {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:block">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid h-14 grid-cols-[140px_minmax(0,1fr)_110px_100px_130px_120px_44px] items-center gap-3 border-b border-zinc-50 px-4 dark:border-zinc-800/50">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-6 w-6 rounded" />
        </div>
      ))}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export function ReceivingMovementView() {
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "SENT" | "PARTIAL">("all");
  const [historyTarget, setHistoryTarget] = React.useState<PORow | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const apiStatuses: Array<"SENT" | "PARTIAL"> = statusFilter === "all" ? ["SENT", "PARTIAL"] : [statusFilter];

  const { data, isLoading, isError, error, refetch, isFetching } = usePurchaseOrdersList({
    status: apiStatuses,
    q: debouncedQ || undefined,
    page: 1,
    pageSize: 50,
  });

  const statsQuery = usePurchaseOrdersStats({ status: ["SENT", "PARTIAL"] });
  const stats = statsQuery.data?.data;

  const rows = data?.data ?? [];

  const sentCount    = rows.filter((r) => r.status === "SENT").length;
  const partialCount = rows.filter((r) => r.status === "PARTIAL").length;
  const overdueRows  = rows.filter((r) => {
    const d = daysUntil(r.expectedEta);
    return d !== null && d < 0;
  });
  const todayRows = rows.filter((r) => daysUntil(r.expectedEta) === 0);

  const [approveTarget, setApproveTarget] = React.useState<PORow | null>(null);
  const [approveNote, setApproveNote] = React.useState("");
  const [rejectTarget, setRejectTarget] = React.useState<PORow | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");

  const approveMutation = useApproveReceiving();
  const rejectMutation = useRejectReceiving();

  const hasFilter = statusFilter !== "all" || debouncedQ !== "";

  return (
    <div className="flex h-full flex-col gap-5 p-4 sm:p-6">

      {/* Header nhỏ (title phụ trong mode) + refresh */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Nhận hàng từ NCC
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Danh sách PO đang chờ giao. Bấm vào hàng để mở wizard nhận hàng.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Làm mới
        </Button>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={Clock}          label="Chờ xử lý"      value={stats?.sentCount ?? sentCount}             sub="PO status SENT"           accent="indigo" />
        <KpiCard icon={Package}        label="Đang nhận"      value={stats?.partialCount ?? partialCount}       sub="đã nhận một phần"         accent="amber"  />
        <KpiCard icon={AlertTriangle}  label="Quá hạn ETA"   value={overdueRows.length}                         sub="cần xử lý gấp"            accent={overdueRows.length > 0 ? "red" : "zinc"} />
        <KpiCard icon={CheckCircle2}   label="Giao hôm nay"   value={todayRows.length}                           sub="theo ETA"                  accent="emerald" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã PO hoặc NCC..."
            className="h-9 w-64 rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { v: "all" as const,     label: "Tất cả",     dot: "bg-zinc-400"   },
            { v: "SENT" as const,    label: "Chờ xử lý",  dot: "bg-blue-500"   },
            { v: "PARTIAL" as const, label: "Đang nhận",  dot: "bg-amber-500"  },
          ].map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setStatusFilter(opt.v)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                statusFilter === opt.v
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:border-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-800"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", opt.dot)} aria-hidden />
              {opt.label}
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{rows.length}</span> PO khớp bộ lọc
        </p>
      </div>

      {/* Body */}
      {isLoading ? (
        <ReceivingTableSkeleton />
      ) : isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">Không tải được PO.</p>
          <p className="mt-1 text-xs">{(error as Error)?.message}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="mt-3">
            Thử lại
          </Button>
        </div>
      ) : rows.length === 0 ? (
        hasFilter ? (
          <EmptyState
            preset="no-filter-match"
            title="Không có PO khớp bộ lọc"
            description="Thử điều chỉnh từ khoá hoặc xoá bộ lọc."
            actions={
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                Xoá bộ lọc
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Không có PO đang chờ nhận"
            description="Chỉ PO trạng thái SENT hoặc PARTIAL mới xuất hiện ở đây."
            actions={
              <Link
                href="/sales?tab=po"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
              >
                <Truck className="h-3.5 w-3.5" aria-hidden />
                Quản lý PO
              </Link>
            }
          />
        )
      ) : (
        <>
          <ReceivingTable
            rows={rows}
            onApprove={(po) => { setApproveTarget(po); setApproveNote(""); }}
            onReject={(po) => { setRejectTarget(po); setRejectReason(""); }}
            onHistory={(po) => setHistoryTarget(po)}
          />
          <ReceivingCardList
            rows={rows}
            onApprove={(po) => { setApproveTarget(po); setApproveNote(""); }}
            onReject={(po) => { setRejectTarget(po); setRejectReason(""); }}
            onHistory={(po) => setHistoryTarget(po)}
          />
        </>
      )}

      {/* Approve dialog */}
      <Dialog open={approveTarget !== null}
        onOpenChange={(o) => { if (!o) { setApproveTarget(null); setApproveNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
              Duyệt nhận đủ PO {approveTarget?.poNo}
            </DialogTitle>
            <DialogDescription>
              PO sẽ chuyển sang <strong>RECEIVED</strong>. Yêu cầu tổng SL đã nhận đạt tối thiểu 95% so với ordered.
              Nếu chưa đủ, hệ thống trả lỗi với chi tiết phần trăm.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="approve-note">Ghi chú (tuỳ chọn)</Label>
            <Textarea
              id="approve-note"
              rows={3}
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              placeholder="VD: Đủ hàng, chất lượng OK."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setApproveTarget(null); setApproveNote(""); }}>
              Huỷ
            </Button>
            <Button
              disabled={!approveTarget || approveMutation.isPending}
              onClick={() => {
                if (!approveTarget) return;
                approveMutation.mutate(
                  { poId: approveTarget.id, note: approveNote.trim() || null },
                  { onSuccess: () => { setApproveTarget(null); setApproveNote(""); } },
                );
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {approveMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xử lý…</>
              ) : (
                <><Check className="h-3.5 w-3.5" /> Duyệt nhận đủ</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectTarget !== null}
        onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-600" aria-hidden />
              Từ chối nhận PO {rejectTarget?.poNo}
            </DialogTitle>
            <DialogDescription>
              PO sẽ chuyển sang <strong>CANCELLED</strong>. Lý do từ chối sẽ được ghi vào audit log.
              Hành động này không huỷ các receiving event đã ghi.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reject-reason">Lý do <span className="text-red-500">*</span> (3–500 ký tự)</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="VD: Hàng hư hỏng, sai SKU, không đúng spec…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectTarget || rejectReason.trim().length < 3 || rejectMutation.isPending}
              onClick={() => {
                if (!rejectTarget) return;
                rejectMutation.mutate(
                  { poId: rejectTarget.id, reason: rejectReason.trim() },
                  { onSuccess: () => { setRejectTarget(null); setRejectReason(""); } },
                );
              }}
            >
              {rejectMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xử lý…</>
              ) : (
                "Từ chối nhận"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History drawer */}
      <ReceivingHistoryDrawer
        po={historyTarget}
        onClose={() => setHistoryTarget(null)}
      />
    </div>
  );
}
