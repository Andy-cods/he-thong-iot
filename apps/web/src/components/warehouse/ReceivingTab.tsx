"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Monitor,
  Package,
  RefreshCw,
  Search,
  Smartphone,
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
import { Label } from "@/components/ui/label";
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
 * V3.2 — `<ReceivingTab>` redesign cho `/warehouse?tab=receiving`.
 *
 * Cải tiến:
 * - Stats KPI bar (4 cards: chờ nhận / đang nhận / quá hạn / hôm nay)
 * - Search + status filter
 * - Card grid responsive (1/2/3 cols)
 * - Drawer xem lịch sử nhận hàng (audit log) per PO
 * - 3 entry points rõ ràng: wizard desktop / single-page / PWA tablet
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

/* ── KPI Card ────────────────────────────────────────────────────────────── */

function KpiCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent: "indigo" | "amber" | "red" | "emerald" | "zinc";
}) {
  const map = {
    indigo:  { card: "bg-indigo-50/70 border-indigo-200",   icon: "bg-indigo-100 text-indigo-700",   value: "text-indigo-900"  },
    amber:   { card: "bg-amber-50/70 border-amber-200",     icon: "bg-amber-100 text-amber-700",     value: "text-amber-900"   },
    red:     { card: "bg-red-50/70 border-red-200",         icon: "bg-red-100 text-red-700",         value: "text-red-900"     },
    emerald: { card: "bg-emerald-50/70 border-emerald-200", icon: "bg-emerald-100 text-emerald-700", value: "text-emerald-900" },
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
          <p className={cn("mt-1 font-mono text-2xl font-bold leading-tight tabular-nums", s.value)}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

/* ── PO Card ─────────────────────────────────────────────────────────────── */

function POCard({
  po, onApprove, onReject, onHistory,
}: {
  po: PORow;
  onApprove: () => void;
  onReject: () => void;
  onHistory: () => void;
}) {
  const days = daysUntil(po.expectedEta);
  const overdue = days !== null && days < 0;
  const isToday = days === 0;
  const soon = days !== null && days > 0 && days <= 3;
  const isPartial = po.status === "PARTIAL";

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm transition-all duration-150 hover:shadow-md",
        overdue ? "border-red-200" : isPartial ? "border-amber-200" : "border-zinc-200 hover:border-indigo-300",
      )}
      data-status={po.status}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
            <span className="font-mono text-sm font-bold text-zinc-900">{po.poNo}</span>
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
              isPartial
                ? "bg-amber-50 text-amber-700 ring-amber-200"
                : "bg-blue-50 text-blue-700 ring-blue-200",
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", isPartial ? "bg-amber-500 animate-pulse" : "bg-blue-500")} />
              {isPartial ? "Đang nhận" : "Chờ xử lý"}
            </span>
          </div>
          <p className="mt-2 truncate text-base font-semibold text-zinc-900">{supplierLabel(po)}</p>
        </div>
        <button
          type="button"
          onClick={onHistory}
          title="Lịch sử nhận hàng"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600 transition-colors"
        >
          <History className="h-4 w-4" aria-hidden />
        </button>
      </header>

      {/* ETA + Date info */}
      <div className="flex flex-col gap-2">
        <div className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
          overdue ? "bg-red-50 text-red-700" :
          isToday ? "bg-amber-50 text-amber-700" :
          soon ? "bg-blue-50 text-blue-700" :
          "bg-zinc-50 text-zinc-600",
        )}>
          {overdue ? (
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Calendar className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span className="font-medium">
            {overdue ? `Quá hạn ${Math.abs(days)} ngày` :
             isToday ? "Giao hôm nay" :
             days !== null && days > 0 ? `Còn ${days} ngày` :
             "Chưa có ETA"}
          </span>
          <span className="ml-auto text-xs tabular-nums opacity-70">
            ETA {po.expectedEta ?? "—"}
          </span>
        </div>

        <p className="text-xs text-zinc-500">
          Ngày đặt: <span className="font-medium text-zinc-700">{po.orderDate}</span>
          {po.totalAmount && (
            <>
              <span className="mx-2 text-zinc-300">·</span>
              Giá trị: <span className="font-mono font-medium text-zinc-700 tabular-nums">
                {Number(po.totalAmount).toLocaleString("vi-VN")} ₫
              </span>
            </>
          )}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        {/* Primary: wizard */}
        <Link
          href={`/receiving/${po.id}/wizard`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          <Monitor className="h-4 w-4" aria-hidden />
          Mở wizard nhận hàng
          <ArrowUpRight className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </Link>

        {/* Secondary: single page + PWA */}
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/receiving/${po.id}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            title="Form nhận hàng đơn giản (single page)"
          >
            <Truck className="h-3.5 w-3.5" aria-hidden />
            Form đơn giản
          </Link>
          <Link
            href={`/pwa/receive/${po.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            title="Mở PWA tablet (offline-capable)"
          >
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            PWA tablet
          </Link>
        </div>

        {/* Approve / Reject */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onApprove}
            className="h-9 border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            Duyệt nhận đủ
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReject}
            className="h-9 border-red-200 bg-red-50/50 text-red-700 hover:bg-red-100 hover:border-red-300"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Từ chối
          </Button>
        </div>
      </div>
    </article>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

function EmptyReceivingState() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100">
        <Truck className="h-7 w-7 text-zinc-400" aria-hidden />
      </div>
      <h3 className="mt-4 text-base font-semibold text-zinc-900">Không có PO đang chờ nhận</h3>
      <p className="mt-1.5 text-sm text-zinc-500">
        Chỉ PO trạng thái <strong>SENT</strong> hoặc <strong>PARTIAL</strong> mới xuất hiện ở đây.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <Link
          href="/sales?tab=po"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Quản lý PO
        </Link>
        <Link
          href="/pwa/receive/demo"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Package className="h-3.5 w-3.5" aria-hidden />
          PWA demo
        </Link>
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export function ReceivingTab() {
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

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto bg-zinc-50/40 p-6">

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-900">
            <Truck className="h-6 w-6 text-indigo-600" aria-hidden />
            PO chờ nhận hàng
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Danh sách PO đang chờ giao. Mở wizard hoặc PWA tablet để quét nhận, hoặc duyệt nhanh từ card.
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
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã PO hoặc NCC..."
            className="h-9 w-64 rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", opt.dot)} aria-hidden />
              {opt.label}
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-zinc-500">
          <span className="font-semibold tabular-nums text-zinc-900">{rows.length}</span> PO khớp bộ lọc
        </p>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white py-12 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Đang tải danh sách PO…
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-semibold">Không tải được PO.</p>
          <p className="mt-1 text-xs">{(error as Error)?.message}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="mt-3">
            Thử lại
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyReceivingState />
      ) : (
        <section
          aria-label="Danh sách PO đang chờ nhận"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {rows.map((po) => (
            <POCard
              key={po.id}
              po={po}
              onApprove={() => { setApproveTarget(po); setApproveNote(""); }}
              onReject={() => { setRejectTarget(po); setRejectReason(""); }}
              onHistory={() => setHistoryTarget(po)}
            />
          ))}
        </section>
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
