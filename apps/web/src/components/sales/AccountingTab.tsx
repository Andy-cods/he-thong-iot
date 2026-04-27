"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Receipt,
  CreditCard,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Building2,
  FileText,
  Banknote,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type POStatus = "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED" | "CANCELLED" | "CLOSED";

type POForAccounting = {
  id: string;
  poNo: string;
  supplierName: string;
  status: POStatus;
  totalAmount: string;
  orderDate: string | null;
  expectedEta: string | null;
  paymentTerms: string | null;
  actualDeliveryDate: string | null;
};

type POListResponse = {
  data: POForAccounting[];
  meta: { total: number; page: number; pageSize: number };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtVND(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0 ₫";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ ₫`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr ₫`;
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("vi-VN");
}

const PO_STATUS_LABEL: Record<POStatus, string> = {
  DRAFT:     "Nháp",
  SENT:      "Đã gửi",
  PARTIAL:   "Nhận một phần",
  RECEIVED:  "Đã nhận",
  CANCELLED: "Đã hủy",
  CLOSED:    "Đóng",
};

const PO_STATUS_CHIP: Record<POStatus, string> = {
  DRAFT:     "bg-zinc-100 text-zinc-600",
  SENT:      "bg-blue-50 text-blue-700",
  PARTIAL:   "bg-amber-50 text-amber-700",
  RECEIVED:  "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-600",
  CLOSED:    "bg-zinc-100 text-zinc-500",
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent = "zinc", trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: "zinc" | "emerald" | "red" | "indigo" | "amber";
  trend?: { dir: "up" | "down"; text: string };
}) {
  const bg: Record<string, string> = {
    zinc:    "bg-white border-zinc-200",
    emerald: "bg-emerald-50/60 border-emerald-200",
    red:     "bg-red-50/60 border-red-200",
    indigo:  "bg-indigo-50/60 border-indigo-200",
    amber:   "bg-amber-50/60 border-amber-200",
  };
  const iconBg: Record<string, string> = {
    zinc:    "bg-zinc-100 text-zinc-600",
    emerald: "bg-emerald-100 text-emerald-700",
    red:     "bg-red-100 text-red-600",
    indigo:  "bg-indigo-100 text-indigo-700",
    amber:   "bg-amber-100 text-amber-700",
  };
  const valColor: Record<string, string> = {
    zinc:    "text-zinc-900",
    emerald: "text-emerald-700",
    red:     "text-red-600",
    indigo:  "text-indigo-700",
    amber:   "text-amber-700",
  };
  return (
    <div className={cn("rounded-2xl border p-5 shadow-sm", bg[accent])}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg[accent])}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <span className={cn("flex items-center gap-0.5 text-xs font-medium", trend.dir === "up" ? "text-emerald-600" : "text-red-500")}>
            {trend.dir === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {trend.text}
          </span>
        )}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-bold tabular-nums", valColor[accent])}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-400">{sub}</p>}
    </div>
  );
}

// ─── Section tab nav ─────────────────────────────────────────────────────────

type AccTab = "dashboard" | "payable" | "payment" | "reports";

const ACC_TABS: Array<{ key: AccTab; label: string; icon: React.ElementType }> = [
  { key: "dashboard", label: "Tổng quan",    icon: BarChart3  },
  { key: "payable",   label: "Công nợ phải trả", icon: CreditCard },
  { key: "payment",   label: "Lịch sử thanh toán", icon: Banknote   },
  { key: "reports",   label: "Báo cáo",       icon: FileText   },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function AccountingTab() {
  const [activeTab, setActiveTab] = React.useState<AccTab>("dashboard");

  const poQuery = useQuery<POListResponse>({
    queryKey: ["po-list-accounting"],
    queryFn: async () => {
      const res = await fetch("/api/purchase-orders?pageSize=200", { credentials: "include" });
      if (!res.ok) throw new Error("Không tải được danh sách PO");
      return res.json();
    },
    staleTime: 30_000,
  });

  const allPOs: POForAccounting[] = poQuery.data?.data ?? [];

  // ── Derived stats ──
  const totalAmount   = allPOs.reduce((s, p) => s + Number(p.totalAmount), 0);
  const receivedPOs   = allPOs.filter(p => p.status === "RECEIVED" || p.status === "CLOSED");
  const pendingPOs    = allPOs.filter(p => p.status === "SENT" || p.status === "PARTIAL");
  const overdueCount  = pendingPOs.filter(p => {
    if (!p.expectedEta) return false;
    return new Date(p.expectedEta) < new Date();
  }).length;
  const receivedAmt   = receivedPOs.reduce((s, p) => s + Number(p.totalAmount), 0);
  const pendingAmt    = pendingPOs.reduce((s, p)  => s + Number(p.totalAmount), 0);
  const receivedCount = receivedPOs.length;
  const pendingCount  = pendingPOs.length;

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <header className="border-b border-zinc-200 bg-white px-6 py-5">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-900">
          <Banknote className="h-6 w-6 text-indigo-600" aria-hidden />
          Kế toán &amp; Thanh toán
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Theo dõi giá trị PO, công nợ phải trả và lịch sử thanh toán nhà cung cấp.
        </p>
      </header>

      {/* ── Sub-tab nav ── */}
      <div className="border-b border-zinc-200 bg-white px-6">
        <div className="flex gap-1">
          {ACC_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors",
                "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-t-full after:transition-all",
                activeTab === t.key
                  ? "text-indigo-700 after:bg-indigo-600"
                  : "text-zinc-500 hover:text-zinc-800 after:bg-transparent",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto bg-zinc-50/40 px-6 py-6">
        {activeTab === "dashboard" && (
          <DashboardTab allPOs={allPOs} isLoading={poQuery.isLoading}
            totalAmount={totalAmount} receivedAmt={receivedAmt} pendingAmt={pendingAmt}
            overdueCount={overdueCount} receivedCount={receivedCount} pendingCount={pendingCount} />
        )}
        {activeTab === "payable" && (
          <PayableTab allPOs={allPOs} isLoading={poQuery.isLoading} />
        )}
        {activeTab === "payment" && (
          <PaymentTab receivedPOs={receivedPOs} isLoading={poQuery.isLoading} />
        )}
        {activeTab === "reports" && (
          <ReportsTab allPOs={allPOs} isLoading={poQuery.isLoading} />
        )}
      </div>
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({ allPOs, isLoading, totalAmount, receivedAmt, pendingAmt, overdueCount, receivedCount, pendingCount }: {
  allPOs: POForAccounting[];
  isLoading: boolean;
  totalAmount: number;
  receivedAmt: number;
  pendingAmt: number;
  overdueCount: number;
  receivedCount: number;
  pendingCount: number;
}) {
  // Group by supplier
  const bySupplier = React.useMemo(() => {
    const m: Record<string, { name: string; total: number; count: number }> = {};
    for (const po of allPOs) {
      if (!m[po.supplierName]) m[po.supplierName] = { name: po.supplierName, total: 0, count: 0 };
      m[po.supplierName]!.total += Number(po.totalAmount);
      m[po.supplierName]!.count += 1;
    }
    return Object.values(m).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [allPOs]);

  // Recent POs (last 5)
  const recentPOs = React.useMemo(
    () => [...allPOs].sort((a, b) => new Date(b.orderDate ?? "").getTime() - new Date(a.orderDate ?? "").getTime()).slice(0, 5),
    [allPOs],
  );

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Tổng giá trị PO"   value={fmtVND(totalAmount)} sub={`${allPOs.length} đơn hàng`} icon={Receipt}  accent="indigo" />
        <KpiCard label="Đã thanh toán"      value={fmtVND(receivedAmt)} sub={`${receivedCount} đơn`} icon={CheckCircle2} accent="emerald" />
        <KpiCard label="Chờ thanh toán"     value={fmtVND(pendingAmt)}  sub={`${pendingCount} đơn`} icon={Clock}    accent="amber" />
        <KpiCard label="Quá hạn"            value={String(overdueCount)} sub="đơn chưa nhận hàng" icon={AlertTriangle} accent={overdueCount > 0 ? "red" : "zinc"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top nhà cung cấp */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-zinc-400" />
            <p className="text-sm font-semibold text-zinc-800">Top nhà cung cấp</p>
          </div>
          {bySupplier.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">Chưa có dữ liệu.</p>
          ) : (
            <div className="space-y-3">
              {bySupplier.map((s, i) => {
                const pct = totalAmount > 0 ? Math.round((s.total / totalAmount) * 100) : 0;
                return (
                  <div key={s.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">{i + 1}</span>
                        <span className="truncate font-medium text-zinc-800">{s.name}</span>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-semibold text-zinc-700">{fmtVND(s.total)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-zinc-400">{s.count} đơn · {pct}% tổng</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PO gần đây */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-zinc-400" />
              <p className="text-sm font-semibold text-zinc-800">PO gần đây</p>
            </div>
            <Link href="/sales?tab=po" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              Xem tất cả <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {recentPOs.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">Chưa có PO nào.</p>
          ) : (
            <div className="space-y-2">
              {recentPOs.map((po) => (
                <Link key={po.id} href={`/procurement/purchase-orders/${po.id}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 hover:border-zinc-200 hover:bg-white transition-colors">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-zinc-800">{po.poNo}</p>
                    <p className="text-xs text-zinc-500 truncate">{po.supplierName}</p>
                  </div>
                  <div className="shrink-0 text-right ml-3">
                    <p className="font-mono text-sm font-bold text-zinc-900">{fmtVND(Number(po.totalAmount))}</p>
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", PO_STATUS_CHIP[po.status as POStatus])}>
                      {PO_STATUS_LABEL[po.status as POStatus]}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Biểu đồ phân bố trạng thái */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-zinc-400" />
          <p className="text-sm font-semibold text-zinc-800">Phân bố trạng thái PO</p>
        </div>
        <StatusDistribution allPOs={allPOs} totalAmount={totalAmount} />
      </div>
    </div>
  );
}

function StatusDistribution({ allPOs, totalAmount }: { allPOs: POForAccounting[]; totalAmount: number }) {
  const statuses: POStatus[] = ["DRAFT", "SENT", "PARTIAL", "RECEIVED", "CANCELLED", "CLOSED"];
  const counts = statuses.map((s) => ({
    status: s,
    count: allPOs.filter(p => p.status === s).length,
    amount: allPOs.filter(p => p.status === s).reduce((a, p) => a + Number(p.totalAmount), 0),
  })).filter(x => x.count > 0);

  if (counts.length === 0) return <p className="text-center text-sm text-zinc-400 py-4">Chưa có dữ liệu.</p>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {counts.map(({ status, count, amount }) => (
        <div key={status} className={cn("rounded-xl border p-3 text-center", PO_STATUS_CHIP[status].includes("indigo") ? "border-indigo-200 bg-indigo-50" : PO_STATUS_CHIP[status].includes("emerald") ? "border-emerald-200 bg-emerald-50" : PO_STATUS_CHIP[status].includes("amber") ? "border-amber-200 bg-amber-50" : PO_STATUS_CHIP[status].includes("red") ? "border-red-200 bg-red-50" : "border-zinc-200 bg-zinc-50")}>
          <p className="text-lg font-bold text-zinc-900">{count}</p>
          <p className="text-[10px] font-semibold text-zinc-500">{PO_STATUS_LABEL[status]}</p>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-400">{fmtVND(amount)}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Payable Tab ──────────────────────────────────────────────────────────────

function PayableTab({ allPOs, isLoading }: { allPOs: POForAccounting[]; isLoading: boolean }) {
  const [filter, setFilter] = React.useState<"all" | "overdue" | "pending">("all");

  const pendingPOList = allPOs.filter(p => p.status === "SENT" || p.status === "PARTIAL");
  const now = new Date();

  const filtered = pendingPOList.filter(po => {
    if (filter === "overdue")  return po.expectedEta && new Date(po.expectedEta) < now;
    if (filter === "pending")  return !po.expectedEta || new Date(po.expectedEta) >= now;
    return true;
  });

  const totalPending = filtered.reduce((s, p) => s + Number(p.totalAmount), 0);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Tổng phải trả"  value={fmtVND(totalPending)} sub={`${filtered.length} đơn`} icon={CreditCard} accent="amber" />
        <KpiCard label="Quá hạn ETA"    value={String(pendingPOList.filter(p => p.expectedEta && new Date(p.expectedEta) < now).length)} sub="đơn chưa nhận" icon={AlertTriangle} accent="red" />
        <KpiCard label="Trong hạn"      value={String(pendingPOList.filter(p => !p.expectedEta || new Date(p.expectedEta) >= now).length)} sub="đơn đang xử lý" icon={Clock} accent="indigo" />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {([["all", "Tất cả"], ["overdue", "Quá hạn"], ["pending", "Trong hạn"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === k ? "bg-indigo-600 text-white" : "bg-white border border-zinc-300 text-zinc-600 hover:border-zinc-400")}>
            {l}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-400">Không có công nợ phù hợp.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-5 py-3 text-left">Mã PO</th>
                  <th className="px-5 py-3 text-left">Nhà cung cấp</th>
                  <th className="px-5 py-3 text-left">Điều khoản TT</th>
                  <th className="px-5 py-3 text-left">ETA</th>
                  <th className="px-5 py-3 text-right">Số tiền</th>
                  <th className="px-5 py-3 text-center">Trạng thái</th>
                  <th className="px-5 py-3 text-center">Hạn TT</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((po) => {
                  const isOverdue = po.expectedEta && new Date(po.expectedEta) < now;
                  return (
                    <tr key={po.id} className={cn("hover:bg-zinc-50 transition-colors", isOverdue && "bg-red-50/40")}>
                      <td className="px-5 py-3.5"><span className="font-mono text-sm font-semibold text-zinc-900">{po.poNo}</span></td>
                      <td className="px-5 py-3.5 text-zinc-700">{po.supplierName}</td>
                      <td className="px-5 py-3.5 text-zinc-500">{po.paymentTerms ?? "—"}</td>
                      <td className="px-5 py-3.5">
                        <span className={cn("text-sm", isOverdue ? "font-semibold text-red-600" : "text-zinc-600")}>
                          {fmtDate(po.expectedEta)}
                          {isOverdue && " ⚠️"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-zinc-900">{fmtVND(Number(po.totalAmount))}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", PO_STATUS_CHIP[po.status as POStatus])}>
                          {PO_STATUS_LABEL[po.status as POStatus]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {isOverdue ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Quá hạn</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Trong hạn</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link href={`/procurement/purchase-orders/${po.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                          Chi tiết <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Payment Tab ──────────────────────────────────────────────────────────────

function PaymentTab({ receivedPOs, isLoading }: { receivedPOs: POForAccounting[]; isLoading: boolean }) {
  // Group by month
  const byMonth = React.useMemo(() => {
    const m: Record<string, { label: string; amount: number; count: number }> = {};
    for (const po of receivedPOs) {
      const d = new Date(po.actualDeliveryDate ?? po.orderDate ?? new Date());
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
      if (!m[key]) m[key] = { label, amount: 0, count: 0 };
      m[key].amount += Number(po.totalAmount);
      m[key].count += 1;
    }
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).map(([, v]) => v);
  }, [receivedPOs]);

  const totalPaid = receivedPOs.reduce((s, p) => s + Number(p.totalAmount), 0);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard label="Tổng đã thanh toán" value={fmtVND(totalPaid)} sub={`${receivedPOs.length} đơn hàng đã hoàn thành`} icon={CheckCircle2} accent="emerald" />
        <KpiCard label="Trung bình / đơn"   value={receivedPOs.length > 0 ? fmtVND(totalPaid / receivedPOs.length) : "—"} sub="giá trị bình quân" icon={TrendingUp} accent="indigo" />
      </div>

      {/* By month chart (bar) */}
      {byMonth.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-zinc-400" />
            <p className="text-sm font-semibold text-zinc-800">Thanh toán theo tháng</p>
          </div>
          <div className="space-y-3">
            {byMonth.map((m, i) => {
              const maxAmt = Math.max(...byMonth.map(x => x.amount));
              const pct = maxAmt > 0 ? Math.round((m.amount / maxAmt) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <p className="w-36 shrink-0 text-xs text-zinc-500 capitalize">{m.label}</p>
                  <div className="flex-1 h-6 overflow-hidden rounded-lg bg-zinc-100">
                    <div className="h-full rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 flex items-center px-2 transition-all duration-500"
                      style={{ width: `${pct}%`, minWidth: pct > 0 ? "2rem" : 0 }}>
                      {pct > 20 && <span className="text-[10px] font-bold text-white">{fmtVND(m.amount)}</span>}
                    </div>
                  </div>
                  <p className="w-28 shrink-0 text-right font-mono text-xs font-semibold text-zinc-700">{fmtVND(m.amount)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment list */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-5 py-3">
          <p className="text-sm font-semibold text-zinc-800">Lịch sử thanh toán</p>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{receivedPOs.length} đơn</span>
        </div>
        {receivedPOs.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-400">Chưa có đơn hàng nào hoàn thành.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-5 py-3 text-left">Mã PO</th>
                  <th className="px-5 py-3 text-left">Nhà cung cấp</th>
                  <th className="px-5 py-3 text-left">Ngày nhận</th>
                  <th className="px-5 py-3 text-right">Số tiền</th>
                  <th className="px-5 py-3 text-center">Trạng thái</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {receivedPOs.slice(0, 50).map((po) => (
                  <tr key={po.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-3.5"><span className="font-mono text-sm font-semibold text-zinc-900">{po.poNo}</span></td>
                    <td className="px-5 py-3.5 text-zinc-700">{po.supplierName}</td>
                    <td className="px-5 py-3.5 text-zinc-500">{fmtDate(po.actualDeliveryDate ?? po.orderDate)}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-700">{fmtVND(Number(po.totalAmount))}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", PO_STATUS_CHIP[po.status as POStatus])}>
                        {PO_STATUS_LABEL[po.status as POStatus]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/procurement/purchase-orders/${po.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                        Chi tiết <ChevronRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reports Tab ──────────────────────────────────────────────────────────────

function ReportsTab({ allPOs, isLoading }: { allPOs: POForAccounting[]; isLoading: boolean }) {
  if (isLoading) return <LoadingSkeleton />;

  const totalAmt   = allPOs.reduce((s, p) => s + Number(p.totalAmount), 0);
  const byStatus   = ["DRAFT","SENT","PARTIAL","RECEIVED","CANCELLED","CLOSED"] as POStatus[];

  // By supplier summary
  const supplierSummary = React.useMemo(() => {
    const m: Record<string, { name: string; count: number; totalAmt: number; receivedAmt: number }> = {};
    for (const po of allPOs) {
      if (!m[po.supplierName]) m[po.supplierName] = { name: po.supplierName, count: 0, totalAmt: 0, receivedAmt: 0 };
      m[po.supplierName]!.count++;
      m[po.supplierName]!.totalAmt += Number(po.totalAmount);
      if (po.status === "RECEIVED" || po.status === "CLOSED") m[po.supplierName]!.receivedAmt += Number(po.totalAmount);
    }
    return Object.values(m).sort((a, b) => b.totalAmt - a.totalAmt);
  }, [allPOs]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Overview stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {byStatus.map(s => {
          const pos = allPOs.filter(p => p.status === s);
          const amt = pos.reduce((a, p) => a + Number(p.totalAmount), 0);
          if (pos.length === 0) return null;
          return (
            <div key={s} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{PO_STATUS_LABEL[s]}</p>
              <p className="mt-1 font-mono text-xl font-bold text-zinc-900">{pos.length}</p>
              <p className="mt-0.5 font-mono text-xs text-zinc-500">{fmtVND(amt)}</p>
            </div>
          );
        })}
      </div>

      {/* Supplier table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 bg-zinc-50 px-5 py-3">
          <p className="text-sm font-semibold text-zinc-800">Tổng hợp theo nhà cung cấp</p>
        </div>
        {supplierSummary.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-400">Chưa có dữ liệu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-5 py-3 text-left">Nhà cung cấp</th>
                  <th className="px-5 py-3 text-right">Số PO</th>
                  <th className="px-5 py-3 text-right">Tổng giá trị</th>
                  <th className="px-5 py-3 text-right">Đã nhận</th>
                  <th className="px-5 py-3 text-right">Tỷ lệ TT</th>
                  <th className="px-5 py-3 text-right">% / Tổng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {supplierSummary.map((s) => {
                  const ratePct   = s.totalAmt > 0 ? Math.round((s.receivedAmt / s.totalAmt) * 100) : 0;
                  const sharePct  = totalAmt > 0 ? Math.round((s.totalAmt / totalAmt) * 100) : 0;
                  return (
                    <tr key={s.name} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-zinc-800">{s.name}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-zinc-600">{s.count}</td>
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-zinc-900">{fmtVND(s.totalAmt)}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-emerald-700">{fmtVND(s.receivedAmt)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100">
                            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500" style={{ width: `${ratePct}%` }} />
                          </div>
                          <span className="font-mono text-xs text-zinc-600">{ratePct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-xs text-zinc-500">{sharePct}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-zinc-200 bg-zinc-50">
                <tr>
                  <td className="px-5 py-3 text-sm font-semibold text-zinc-800">Tổng cộng</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-zinc-800">{allPOs.length}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-zinc-900">{fmtVND(totalAmt)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-emerald-700">
                    {fmtVND(allPOs.filter(p => p.status==="RECEIVED"||p.status==="CLOSED").reduce((s,p)=>s+Number(p.totalAmount),0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Export hint */}
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-center">
        <TrendingDown className="mx-auto mb-2 h-6 w-6 text-zinc-400" />
        <p className="text-sm font-medium text-zinc-600">Xuất báo cáo Excel</p>
        <p className="mt-0.5 text-xs text-zinc-400">Tính năng xuất báo cáo kế toán sẽ có trong V2.1</p>
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 max-w-6xl">
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
