"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Factory,
  CalendarClock,
  Workflow,
  History,
  FileImage,
  Ruler,
  Clock,
  LayoutDashboard,
  Package,
  TrendingUp,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressReportForm } from "@/components/work-orders/ProgressReportForm";
import { ProgressTimeline } from "@/components/work-orders/ProgressTimeline";
import { RoutingPlanEditor } from "@/components/work-orders/RoutingPlanEditor";
import { MaterialRequirementsTable } from "@/components/work-orders/MaterialRequirementsTable";
import { QcChecklistEnriched } from "@/components/work-orders/QcChecklistEnriched";
import { WorkOrderActions } from "@/components/work-orders/WorkOrderActions";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import {
  useWoProgressLog,
  useWorkOrderDetail,
  type WorkOrderStatus,
} from "@/hooks/useWorkOrders";

// ─── Status display ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  DRAFT: "Nháp",
  QUEUED: "Hàng đợi",
  RELEASED: "Đã phát hành",
  IN_PROGRESS: "Đang chạy",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const STATUS_CHIP: Record<WorkOrderStatus, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600 border border-zinc-200",
  QUEUED: "bg-zinc-100 text-zinc-600 border border-zinc-200",
  RELEASED: "bg-blue-50 text-blue-700 border border-blue-200",
  IN_PROGRESS: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  PAUSED: "bg-amber-50 text-amber-700 border border-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  CANCELLED: "bg-red-50 text-red-600 border border-red-200",
};

// ─── Sections ─────────────────────────────────────────────────────────────────

type SectionKey = "overview" | "materials" | "routing" | "progress" | "qc" | "history";

const SECTIONS: Array<{
  key: SectionKey;
  label: string;
  icon: React.ElementType;
  step: string;
}> = [
  { key: "overview",   label: "Tổng quan",  icon: LayoutDashboard, step: "01" },
  { key: "materials",  label: "Vật liệu",   icon: Package,          step: "02" },
  { key: "routing",    label: "Quy trình",  icon: Workflow,         step: "03" },
  { key: "progress",   label: "Tiến độ",    icon: TrendingUp,       step: "04" },
  { key: "qc",         label: "Kiểm tra",   icon: ShieldCheck,      step: "05" },
  { key: "history",    label: "Lịch sử",    icon: History,          step: "06" },
];

// ─── Progress Ring SVG (gradient, light bg) ───────────────────────────────────

function ProgressRing({ pct, size = 100, stroke = 7 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const offset = C - (pct / 100) * C;
  const uid = React.useId();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-g`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f4f4f5" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={pct > 0 ? `url(#${uid}-g)` : "#e4e4e7"}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.7s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-zinc-900">{pct}%</span>
        <span className="text-[9px] uppercase tracking-wider text-zinc-400">done</span>
      </div>
    </div>
  );
}

// ─── Horizontal Stepper ───────────────────────────────────────────────────────

function HorizontalStepper({
  active,
  onChange,
  activeIdx,
}: {
  active: SectionKey;
  onChange: (k: SectionKey) => void;
  activeIdx: number;
}) {
  return (
    <div className="flex items-start gap-0 w-full">
      {SECTIONS.map((s, idx) => {
        const isPast   = idx < activeIdx;
        const isActive = s.key === active;
        const isPending = !isPast && !isActive;
        return (
          <React.Fragment key={s.key}>
            <button
              type="button"
              onClick={() => onChange(s.key)}
              className="flex flex-col items-center gap-1.5 group min-w-0"
            >
              <div
                className={cn(
                  "flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full transition-all duration-200 shrink-0",
                  isPast    ? "bg-emerald-500 text-white shadow-sm"
                  : isActive ? "bg-indigo-600 text-white ring-4 ring-indigo-100 scale-110 shadow-md"
                            : "bg-white border-2 border-zinc-300 text-zinc-400 group-hover:border-zinc-400",
                )}
              >
                {isPast ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <s.icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={cn(
                  "hidden sm:block text-[11px] font-medium whitespace-nowrap leading-none transition-colors",
                  isPast    ? "text-emerald-600"
                  : isActive ? "text-indigo-600 font-semibold"
                            : "text-zinc-400 group-hover:text-zinc-600",
                )}
              >
                {s.label}
              </span>
            </button>

            {idx < SECTIONS.length - 1 && (
              <div className={cn("mt-4 sm:mt-5 flex-1 h-px transition-colors", isPast ? "bg-emerald-300" : "bg-zinc-200")} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Section heading ─────────────────────────────────────────────────────────

function SectionHeading({ icon: Icon, title, subtitle, badge }: {
  icon: React.ElementType; title: string; subtitle?: string; badge?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50">
          <Icon className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {badge && (
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">{badge}</span>
      )}
    </div>
  );
}

// ─── KPI card (light) ─────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent = "zinc" }: {
  label: string; value: string; sub?: string;
  accent?: "zinc" | "emerald" | "red" | "indigo" | "amber";
}) {
  const styles: Record<string, string> = {
    zinc:    "border-zinc-200 bg-white",
    emerald: "border-emerald-200 bg-emerald-50/60",
    red:     "border-red-200 bg-red-50/60",
    indigo:  "border-indigo-200 bg-indigo-50/60",
    amber:   "border-amber-200 bg-amber-50/60",
  };
  const val: Record<string, string> = {
    zinc:    "text-zinc-900",
    emerald: "text-emerald-700",
    red:     "text-red-600",
    indigo:  "text-indigo-700",
    amber:   "text-amber-700",
  };
  return (
    <div className={cn("rounded-xl border p-4", styles[accent])}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={cn("mt-1.5 font-mono text-2xl font-bold tabular-nums", val[accent])}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-400">{sub}</p>}
    </div>
  );
}

// ─── Info card ────────────────────────────────────────────────────────────────

function InfoCard({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
          <Icon className="h-4 w-4 text-indigo-600" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{title}</p>
      </div>
      {children}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const id = params.id;

  const rawSection = searchParams.get("section") as SectionKey | null;
  const section: SectionKey = SECTIONS.some((s) => s.key === rawSection) ? rawSection! : "overview";
  const activeIdx = SECTIONS.findIndex((s) => s.key === section);
  const nextSection = activeIdx < SECTIONS.length - 1 ? SECTIONS[activeIdx + 1] : null;
  const prevSection = activeIdx > 0 ? SECTIONS[activeIdx - 1] : null;

  const setSection = React.useCallback(
    (key: SectionKey) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("section", key);
      router.replace(`?${sp.toString()}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [router, searchParams],
  );

  const query = useWorkOrderDetail(id);
  const wo = query.data?.data;

  const sourceBomQuery = useQuery<{ data: { lineId: string; templateId: string; templateCode: string; templateName: string; componentSku: string | null; componentName: string | null; metadata: Record<string, unknown>; } | null }>({
    queryKey: ["work-orders", "source-bom", id],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${id}/source-bom`, { credentials: "include" });
      if (!res.ok) throw new Error("Không tải được nguồn BOM");
      return res.json();
    },
    enabled: !!id, staleTime: 60_000,
  });

  const auditQuery = useQuery<{ data: AuditRow[]; meta: { total: number } }>({
    queryKey: ["work-orders", "audit", id],
    queryFn: async () => {
      const p = new URLSearchParams({ entity: "work_order", objectId: id, pageSize: "50" });
      const res = await fetch(`/api/admin/audit?${p.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Không tải được audit log");
      return res.json();
    },
    enabled: !!id, staleTime: 30_000,
  });

  const progressLogQuery = useWoProgressLog(id);

  const roles = session.data?.roles ?? [];
  const isAdmin      = roles.includes("admin");
  const isPlannerPlus = roles.includes("admin") || roles.includes("planner");
  const canOperate   = roles.includes("admin") || roles.includes("planner") || roles.includes("operator");
  const canComplete  = roles.includes("admin") || roles.includes("planner");

  const [defaultLineForReport, setDefaultLineForReport] = React.useState<string | null>(null);

  // ── Loading ──
  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6 space-y-3">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-60 w-full rounded-2xl" />
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6">
        <p className="text-sm text-red-600">Không tìm thấy Work Order.</p>
        <Button className="mt-2" variant="ghost" size="sm" onClick={() => router.push("/work-orders")}>
          <ChevronLeft className="h-3.5 w-3.5" /> Quay lại
        </Button>
      </div>
    );
  }

  // ── Derived stats ──
  const totalRequired  = wo.lines.reduce((a, l) => a + Number(l.requiredQty), 0);
  const totalCompleted = wo.lines.reduce((a, l) => a + Number(l.completedQty), 0);
  const progress       = totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;
  const estimated      = wo.estimatedHours ? Number(wo.estimatedHours) : null;
  const actual         = wo.actualHours    ? Number(wo.actualHours)    : null;
  const tolerance      = (wo.toleranceSpecs ?? null) as Record<string, unknown> | null;
  const srcBom         = sourceBomQuery.data?.data ?? null;

  return (
    <div className="min-h-screen bg-zinc-50">

      {/* ══ STICKY TOP BAR ══ */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-zinc-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          {/* Row 1 — WO identity + actions */}
          <div className="flex items-center gap-3 py-3">
            <button
              type="button"
              onClick={() => router.push("/work-orders")}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors text-sm"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Quay lại</span>
            </button>
            <div className="h-4 w-px bg-zinc-300 shrink-0" />
            <Factory className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="font-mono text-base font-bold tracking-tight text-zinc-900 truncate">{wo.woNo}</span>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0", STATUS_CHIP[wo.status])}>
              {STATUS_LABEL[wo.status]}
            </span>
            <span className="hidden sm:inline text-xs text-zinc-400">· {wo.orderNo ?? "—"} · P{wo.priority}</span>
            <div className="ml-auto shrink-0">
              <WorkOrderActions
                woId={wo.id}
                status={wo.status}
                versionLock={wo.versionLock}
                canOperate={canOperate}
                canComplete={canComplete}
                canCancel={isAdmin}
              />
            </div>
          </div>

          {/* Row 2 — Horizontal stepper */}
          <div className="pb-4 pt-1">
            <HorizontalStepper active={section} onChange={setSection} activeIdx={activeIdx} />
          </div>
        </div>
      </header>

      {/* ══ MAIN CONTENT ══ */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ═══════════════ OVERVIEW ═══════════════ */}
        {section === "overview" && (
          <>
            <SectionHeading icon={LayoutDashboard} title="Tổng quan" subtitle="Thông tin chung và hành trình Work Order" />

            {/* Hero card */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-6">
                <ProgressRing pct={progress} size={100} stroke={7} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-2xl font-bold tracking-tight text-zinc-900">{wo.woNo}</span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_CHIP[wo.status])}>
                      {STATUS_LABEL[wo.status]}
                    </span>
                    <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-mono text-zinc-500">P{wo.priority}</span>
                  </div>
                  {/* KPI inline */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                    {[
                      { label: "Kế hoạch", value: Number(wo.plannedQty).toLocaleString("vi-VN") },
                      { label: "Đạt",      value: Number(wo.goodQty).toLocaleString("vi-VN"), color: "text-emerald-700" },
                      { label: "Phế",      value: Number(wo.scrapQty).toLocaleString("vi-VN"), color: "text-red-600" },
                      { label: "Giờ công", value: actual !== null ? `${actual.toFixed(1)}h` : estimated !== null ? `${estimated}h (KH)` : "—" },
                    ].map((stat, i, arr) => (
                      <React.Fragment key={stat.label}>
                        <div>
                          <p className="text-xs text-zinc-500">{stat.label}</p>
                          <p className={cn("font-mono text-xl font-bold tabular-nums", stat.color ?? "text-zinc-900")}>{stat.value}</p>
                        </div>
                        {i < arr.length - 1 && <div className="h-8 w-px bg-zinc-200" />}
                      </React.Fragment>
                    ))}
                  </div>
                  {/* Gradient progress bar */}
                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 transition-all duration-700"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
                      <span>{totalCompleted.toLocaleString("vi-VN")} done</span>
                      <span>{totalRequired.toLocaleString("vi-VN")} total</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3 info cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Source BOM */}
              <InfoCard icon={Workflow} title="Nguồn BOM">
                {srcBom ? (
                  <>
                    <Link href={`/bom/${srcBom.templateId}/grid`} className="flex items-center gap-1 font-mono text-sm font-bold text-indigo-600 hover:underline">
                      {srcBom.templateCode} <ExternalLink className="h-3 w-3 shrink-0" />
                    </Link>
                    <p className="mt-0.5 text-xs text-zinc-500">{srcBom.templateName}</p>
                    {srcBom.componentSku && <p className="mt-1 font-mono text-xs text-emerald-700">{srcBom.componentSku}</p>}
                  </>
                ) : (
                  <p className="text-xs text-zinc-400">{sourceBomQuery.isLoading ? "Đang tải…" : "Chưa liên kết BOM."}</p>
                )}
              </InfoCard>

              {/* Đơn hàng */}
              <InfoCard icon={Factory} title="Đơn hàng">
                <p className="font-mono text-sm font-bold text-zinc-900">{wo.orderNo ?? "—"}</p>
              </InfoCard>

              {/* Giờ công */}
              <InfoCard icon={Clock} title="Giờ công">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Ước tính</span>
                    <span className="font-mono font-semibold text-zinc-800">{estimated !== null ? `${estimated}h` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Thực tế</span>
                    <span className={cn("font-mono font-semibold", actual !== null && estimated !== null && actual > estimated ? "text-red-600" : "text-zinc-800")}>
                      {actual !== null ? `${actual.toFixed(1)}h` : "—"}
                    </span>
                  </div>
                  {estimated !== null && actual !== null && (
                    <div className={cn("rounded-lg px-2 py-1 text-center text-[10px] font-semibold", actual > estimated ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700")}>
                      {actual > estimated ? `Vượt ${(actual - estimated).toFixed(1)}h` : `Còn ${(estimated - actual).toFixed(1)}h`}
                    </div>
                  )}
                </div>
              </InfoCard>
            </div>

            {/* Milestone timeline horizontal */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="mb-5 flex items-center gap-2 text-sm font-semibold text-zinc-700">
                <CalendarClock className="h-4 w-4 text-zinc-400" /> Hành trình Work Order
              </p>
              <div className="flex items-start overflow-x-auto pb-2">
                {[
                  { label: "Tạo WO",     time: wo.createdAt,   always: true },
                  { label: "Phát hành",  time: wo.releasedAt },
                  { label: "Bắt đầu SX", time: wo.startedAt },
                  { label: "Tạm dừng",   time: wo.pausedAt,    warn: true, note: wo.pausedReason ?? undefined },
                  { label: "Hoàn thành", time: wo.completedAt },
                ].filter((m) => m.always || m.time).map((m, i, arr) => (
                  <React.Fragment key={m.label}>
                    <div className="flex min-w-[110px] flex-col items-center gap-1 text-center">
                      <div className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                        m.warn ? "bg-amber-100 text-amber-700" : m.time ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400",
                      )}>
                        {m.warn ? "!" : m.time ? "✓" : i + 1}
                      </div>
                      <p className={cn("text-[11px] font-semibold", m.warn ? "text-amber-600" : m.time ? "text-emerald-700" : "text-zinc-400")}>{m.label}</p>
                      <p className="font-mono text-[10px] text-zinc-400">{m.time ? new Date(m.time).toLocaleDateString("vi-VN") : "—"}</p>
                      {m.note && <p className="text-[10px] text-amber-600">· {m.note}</p>}
                    </div>
                    {i < arr.length - 1 && <div className="mt-3.5 flex-1 h-px bg-zinc-200 min-w-4" />}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Technical specs */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700">
                  <FileImage className="h-4 w-4 text-zinc-400" /> Bản vẽ kỹ thuật
                </p>
                {wo.technicalDrawingUrl ? (
                  <a href={wo.technicalDrawingUrl} target="_blank" rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-indigo-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{wo.technicalDrawingUrl}</span>
                  </a>
                ) : (
                  <p className="text-xs text-zinc-400">Chưa có bản vẽ.</p>
                )}
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700">
                  <Ruler className="h-4 w-4 text-zinc-400" /> Dung sai / Spec
                </p>
                {tolerance && Object.keys(tolerance).length > 0 ? (
                  <dl className="grid grid-cols-2 gap-1.5 text-xs">
                    {Object.entries(tolerance).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-zinc-50 px-2.5 py-2">
                        <dt className="text-zinc-500">{k}</dt>
                        <dd className="font-mono font-semibold text-zinc-800">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className="text-xs text-zinc-400">Chưa khai báo dung sai.</p>}
              </div>
            </div>

            {wo.notes && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Ghi chú</p>
                <p className="whitespace-pre-wrap text-sm text-zinc-700">{wo.notes}</p>
              </div>
            )}
          </>
        )}

        {/* ═══════════════ MATERIALS ═══════════════ */}
        {section === "materials" && (
          <>
            <SectionHeading icon={Package} title="Vật liệu & BOM" subtitle={`${wo.lines.length} lines sản xuất`} badge={`${wo.lines.length} items`} />

            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-5 py-3">
                <p className="text-sm font-semibold text-zinc-800">Lines sản xuất</p>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">{wo.lines.length} items</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-100 bg-zinc-50/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-5 py-3 text-left">#</th>
                      <th className="px-5 py-3 text-left">SKU</th>
                      <th className="px-5 py-3 text-left">Tên linh kiện</th>
                      <th className="px-5 py-3 text-right">Yêu cầu</th>
                      <th className="px-5 py-3 text-right">Hoàn thành</th>
                      <th className="px-5 py-3 text-left min-w-[140px]">Tiến độ</th>
                      <th className="px-5 py-3 text-center">Trạng thái</th>
                      {canOperate && <th className="px-5 py-3 text-right" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {wo.lines.map((l) => {
                      const req = Number(l.requiredQty), done = Number(l.completedQty);
                      const pct = req > 0 ? Math.round((done / req) * 100) : 0;
                      const isDone = pct >= 100, isRun = pct > 0 && pct < 100;
                      return (
                        <tr key={l.id} className="hover:bg-zinc-50/60 transition-colors">
                          <td className="px-5 py-3.5 text-zinc-400">{l.position}</td>
                          <td className="px-5 py-3.5"><span className="font-mono text-xs text-zinc-500">{l.componentSku}</span></td>
                          <td className="px-5 py-3.5 font-medium text-zinc-800">{l.componentName}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-zinc-600">{req.toLocaleString("vi-VN")}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-zinc-900">{done.toLocaleString("vi-VN")}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-100">
                                <div className={cn("h-full transition-all", isDone ? "bg-emerald-500" : isRun ? "bg-gradient-to-r from-indigo-500 to-violet-500" : "bg-zinc-300")} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs tabular-nums text-zinc-500">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {isDone ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />DONE</span>
                            ) : isRun ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700"><TrendingUp className="h-3 w-3" />RUNNING</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500"><AlertCircle className="h-3 w-3" />PENDING</span>
                            )}
                          </td>
                          {canOperate && (
                            <td className="px-5 py-3.5 text-right">
                              <button type="button" onClick={() => { setDefaultLineForReport(l.id); setSection("progress"); }}
                                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                                + Báo cáo
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-5 py-3">
                <span className="text-xs text-zinc-500">
                  Tổng: <span className="font-semibold text-zinc-800">{totalCompleted.toLocaleString("vi-VN")} / {totalRequired.toLocaleString("vi-VN")}</span> units
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-200">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="font-mono text-xs font-semibold text-zinc-700">{progress}%</span>
                </div>
              </div>
            </div>

            <MaterialRequirementsTable woId={wo.id} requirements={wo.materialRequirements} versionLock={wo.versionLock} canEdit={isPlannerPlus} />
          </>
        )}

        {/* ═══════════════ ROUTING ═══════════════ */}
        {section === "routing" && (
          <>
            <SectionHeading icon={Workflow} title="Quy trình Sản xuất" subtitle="Routing plan và các bước gia công" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700"><FileImage className="h-4 w-4 text-zinc-400" />Bản vẽ kỹ thuật</p>
                {wo.technicalDrawingUrl ? (
                  <a href={wo.technicalDrawingUrl} target="_blank" rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-indigo-600 hover:underline">
                    <ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{wo.technicalDrawingUrl}</span>
                  </a>
                ) : <p className="text-xs text-zinc-400">Chưa có bản vẽ.</p>}
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700"><Ruler className="h-4 w-4 text-zinc-400" />Dung sai / Spec</p>
                {tolerance && Object.keys(tolerance).length > 0 ? (
                  <dl className="grid grid-cols-2 gap-1.5 text-xs">
                    {Object.entries(tolerance).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-zinc-50 px-2.5 py-2">
                        <dt className="text-zinc-500">{k}</dt>
                        <dd className="font-mono font-semibold text-zinc-800">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className="text-xs text-zinc-400">Chưa khai báo dung sai.</p>}
              </div>
            </div>
            <RoutingPlanEditor woId={wo.id} routingPlan={wo.routingPlan} versionLock={wo.versionLock} canEdit={isPlannerPlus} />
          </>
        )}

        {/* ═══════════════ PROGRESS ═══════════════ */}
        {section === "progress" && (
          <>
            <SectionHeading icon={TrendingUp} title="Tiến độ & Báo cáo" subtitle="Theo dõi và ghi nhận kết quả sản xuất" />

            {/* 4 KPI */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Kế hoạch"   value={Number(wo.plannedQty).toLocaleString("vi-VN")} sub="units" accent="zinc" />
              <KpiCard label="Đạt được"   value={Number(wo.goodQty).toLocaleString("vi-VN")}   sub="units" accent="emerald" />
              <KpiCard label="Phế phẩm"   value={Number(wo.scrapQty).toLocaleString("vi-VN")}  sub="units" accent="red" />
              <KpiCard label="Hoàn thành" value={`${progress}%`} sub={`${totalCompleted}/${totalRequired}`} accent="indigo" />
            </div>

            {/* Master progress bar */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-700">Tiến độ tổng thể</p>
                <p className="font-mono text-sm font-bold text-indigo-600">{progress}%</p>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 transition-all duration-700" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-zinc-400">
                <span>0%</span>
                <span className="font-semibold text-zinc-600">{totalCompleted.toLocaleString("vi-VN")} / {totalRequired.toLocaleString("vi-VN")} units</span>
                <span>100%</span>
              </div>
            </div>

            {/* Quick actions */}
            {wo.status !== "COMPLETED" && wo.status !== "CANCELLED" && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">Thao tác</p>
                <WorkOrderActions woId={wo.id} status={wo.status} versionLock={wo.versionLock} canOperate={canOperate} canComplete={canComplete} canCancel={isAdmin} size="sm" />
              </div>
            )}

            {/* Report form — redesigned */}
            {canOperate && (wo.status === "IN_PROGRESS" || wo.status === "PAUSED") && (
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                {/* Form header — gradient */}
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4">
                  <p className="text-base font-semibold text-white">Báo cáo tiến độ</p>
                  <p className="mt-0.5 text-xs text-indigo-200">Ghi nhận kết quả sản xuất cho Work Order này</p>
                </div>
                <div className="p-6">
                  <ProgressReportForm
                    woId={wo.id}
                    lines={wo.lines}
                    defaultLineId={defaultLineForReport}
                    onSubmitted={() => setDefaultLineForReport(null)}
                  />
                </div>
              </div>
            )}

            {/* Lines compact table */}
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-zinc-50 px-5 py-3">
                <p className="text-sm font-semibold text-zinc-800">Chi tiết lines ({wo.lines.length})</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-100 bg-zinc-50/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-5 py-2.5 text-left">#</th>
                      <th className="px-5 py-2.5 text-left">SKU</th>
                      <th className="px-5 py-2.5 text-left">Tên</th>
                      <th className="px-5 py-2.5 text-right">Required</th>
                      <th className="px-5 py-2.5 text-right">Done</th>
                      <th className="px-5 py-2.5 text-left">Progress</th>
                      {canOperate && <th className="px-5 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {wo.lines.map((l) => {
                      const req = Number(l.requiredQty), done = Number(l.completedQty);
                      const pct = req > 0 ? Math.round((done / req) * 100) : 0;
                      return (
                        <tr key={l.id} className="hover:bg-zinc-50/60 transition-colors">
                          <td className="px-5 py-3 text-zinc-400">{l.position}</td>
                          <td className="px-5 py-3 font-mono text-xs text-zinc-500">{l.componentSku}</td>
                          <td className="px-5 py-3 text-zinc-800">{l.componentName}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-zinc-600">{req.toLocaleString("vi-VN")}</td>
                          <td className="px-5 py-3 text-right tabular-nums font-semibold text-zinc-900">{done.toLocaleString("vi-VN")}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                                <div className={cn("h-full", pct >= 100 ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-violet-500")} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs tabular-nums text-zinc-500">{pct}%</span>
                            </div>
                          </td>
                          {canOperate && (
                            <td className="px-5 py-3 text-right">
                              <button type="button"
                                onClick={() => { setDefaultLineForReport(l.id); document.getElementById("report-anchor")?.scrollIntoView({ behavior: "smooth" }); }}
                                className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                                + Báo cáo
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div id="report-anchor" />
            <ProgressTimeline woId={wo.id} />
          </>
        )}

        {/* ═══════════════ QC ═══════════════ */}
        {section === "qc" && (
          <>
            <SectionHeading icon={ShieldCheck} title="QC & Kiểm tra" subtitle="Checklist kiểm tra chất lượng sản phẩm" />
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <QcChecklistEnriched woId={wo.id} woStatus={wo.status} canEdit={canOperate || roles.includes("warehouse")} isAdmin={isAdmin} />
            </div>
          </>
        )}

        {/* ═══════════════ HISTORY ═══════════════ */}
        {section === "history" && (
          <>
            <SectionHeading icon={History} title="Lịch sử" subtitle="Audit log và lịch sử tiến độ gộp" />
            <AuditMergedTimeline
              woId={wo.id}
              auditRows={auditQuery.data?.data ?? []}
              progressRows={progressLogQuery.data?.data ?? []}
              isLoading={auditQuery.isLoading || progressLogQuery.isLoading}
              totalAudit={auditQuery.data?.meta.total ?? 0}
            />
          </>
        )}

        {/* ══ Bottom prev/next ══ */}
        <div className="mt-10 flex items-center justify-between border-t border-zinc-200 pt-6">
          <button type="button" onClick={() => prevSection && setSection(prevSection.key)} disabled={!prevSection}
            className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm">
            <ChevronLeft className="h-4 w-4" />
            {prevSection ? prevSection.label : "Quay lại"}
          </button>
          <span className="text-xs text-zinc-400 font-mono">{SECTIONS[activeIdx]?.step ?? "—"} / 06</span>
          <button type="button" onClick={() => nextSection && setSection(nextSection.key)} disabled={!nextSection}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm">
            {nextSection ? nextSection.label : "Kết thúc"}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </main>
    </div>
  );
}

// ─── Audit merged timeline ────────────────────────────────────────────────────

type AuditRow = { id: string; action: string; actorUsername: string | null; actorDisplayName: string | null; objectType: string; notes: string | null; occurredAt: string; afterJson: unknown; };
type ProgressRow = { id: string; stepType: string; qtyCompleted: string; qtyScrap: string; notes: string | null; station: string | null; operatorUsername: string | null; operatorDisplayName: string | null; createdAt: string; };

function AuditMergedTimeline({ woId, auditRows, progressRows, isLoading, totalAudit }: {
  woId: string; auditRows: AuditRow[]; progressRows: ProgressRow[]; isLoading: boolean; totalAudit: number;
}) {
  const [filter, setFilter] = React.useState<"all" | "audit" | "progress">("all");
  type Merged = { kind: "audit"; row: AuditRow; at: number } | { kind: "progress"; row: ProgressRow; at: number };
  const merged: Merged[] = React.useMemo(() => {
    const out: Merged[] = [];
    if (filter !== "progress") auditRows.forEach(r => out.push({ kind: "audit", row: r, at: new Date(r.occurredAt).getTime() }));
    if (filter !== "audit")    progressRows.forEach(r => out.push({ kind: "progress", row: r, at: new Date(r.createdAt).getTime() }));
    return out.sort((a, b) => b.at - a.at).slice(0, 80);
  }, [auditRows, progressRows, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-800">Lịch sử thao tác</h3>
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-500">{totalAudit} audit · {progressRows.length} progress</span>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/admin/audit?entity=work_order&objectId=${woId}`} className="text-xs">Xem đầy đủ</Link>
        </Button>
      </div>
      {/* Filter chips */}
      <div className="flex gap-1.5">
        {(["all", "audit", "progress"] as const).map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f ? "bg-indigo-600 text-white" : "bg-white border border-zinc-300 text-zinc-600 hover:border-zinc-400")}>
            {f === "all" ? "Tất cả" : f === "audit" ? "Audit" : "Tiến độ"}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : merged.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 p-10 text-center text-xs text-zinc-400">Chưa có sự kiện nào.</div>
      ) : (
        <ol className="relative space-y-3 before:absolute before:left-[18px] before:top-0 before:bottom-0 before:w-px before:bg-zinc-200">
          {merged.map(m => {
            const isAudit = m.kind === "audit";
            const actor   = isAudit ? (m.row.actorDisplayName ?? m.row.actorUsername ?? "Hệ thống") : (m.row.operatorDisplayName ?? m.row.operatorUsername ?? "—");
            const initials = actor.slice(0, 2).toUpperCase();
            return (
              <li key={`${m.kind}-${m.row.id}`} className="flex gap-4">
                {/* Avatar */}
                <div className={cn(
                  "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-white",
                  isAudit ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700",
                )}>
                  {initials}
                </div>
                {/* Content card */}
                <div className="flex-1 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-zinc-900">{actor}</span>
                      {isAudit ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">{m.row.action}</span>
                      ) : (
                        <>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{m.row.stepType}</span>
                          {m.row.station && <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">{m.row.station}</span>}
                          {Number(m.row.qtyCompleted) > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">+{Number(m.row.qtyCompleted).toLocaleString("vi-VN")} đạt</span>}
                          {Number(m.row.qtyScrap) > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">{Number(m.row.qtyScrap).toLocaleString("vi-VN")} phế</span>}
                        </>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-400 font-mono whitespace-nowrap">
                      {new Date(isAudit ? m.row.occurredAt : m.row.createdAt).toLocaleString("vi-VN")}
                    </p>
                  </div>
                  {isAudit && m.row.notes && <p className="mt-1 text-xs text-zinc-500">· {m.row.notes}</p>}
                  {!isAudit && m.row.notes && <p className="mt-1 text-xs italic text-zinc-500">· {m.row.notes}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
