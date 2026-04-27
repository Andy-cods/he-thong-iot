"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
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

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  DRAFT: "Nháp",
  QUEUED: "Hàng đợi",
  RELEASED: "Đã phát hành",
  IN_PROGRESS: "Đang chạy",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const STATUS_COLOR: Record<WorkOrderStatus, string> = {
  DRAFT: "bg-slate-700 text-slate-300",
  QUEUED: "bg-slate-600 text-slate-200",
  RELEASED: "bg-blue-900 text-blue-300",
  IN_PROGRESS: "bg-indigo-900 text-indigo-300 ring-1 ring-indigo-500",
  PAUSED: "bg-amber-900 text-amber-300",
  COMPLETED: "bg-emerald-900 text-emerald-300",
  CANCELLED: "bg-red-900 text-red-300",
};

type SectionKey = "overview" | "materials" | "routing" | "progress" | "qc" | "history";

const SECTIONS: Array<{
  key: SectionKey;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  stepLabel: string;
}> = [
  { key: "overview", label: "Tổng quan", shortLabel: "Overview", icon: LayoutDashboard, stepLabel: "01" },
  { key: "materials", label: "Vật liệu", shortLabel: "Materials", icon: Package, stepLabel: "02" },
  { key: "routing", label: "Quy trình", shortLabel: "Routing", icon: Workflow, stepLabel: "03" },
  { key: "progress", label: "Tiến độ", shortLabel: "Progress", icon: TrendingUp, stepLabel: "04" },
  { key: "qc", label: "Kiểm tra", shortLabel: "QC", icon: ShieldCheck, stepLabel: "05" },
  { key: "history", label: "Lịch sử", shortLabel: "History", icon: History, stepLabel: "06" },
];

// ============================================================================
// Progress Ring — gradient stroke, dark bg
// ============================================================================
function ProgressRing({
  pct,
  size = 120,
  stroke = 8,
}: {
  pct: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const offset = C - (pct / 100) * C;
  const id = React.useId();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`${id}-g`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={pct >= 100 ? "#10b981" : pct > 0 ? `url(#${id}-g)` : "#334155"}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.7s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-white">{pct}%</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wider">done</span>
      </div>
    </div>
  );
}

// ============================================================================
// Horizontal Stepper
// ============================================================================
function HorizontalStepper({
  sections,
  active,
  sectionDoneMap,
  onChange,
}: {
  sections: typeof SECTIONS;
  active: SectionKey;
  sectionDoneMap: Record<SectionKey, boolean>;
  onChange: (k: SectionKey) => void;
}) {
  const activeIdx = sections.findIndex((s) => s.key === active);
  return (
    <div className="flex items-center justify-center gap-0 px-2">
      {sections.map((s, idx) => {
        const isDone = sectionDoneMap[s.key];
        const isActive = s.key === active;
        const isPast = idx < activeIdx;
        return (
          <React.Fragment key={s.key}>
            {/* Step node */}
            <button
              type="button"
              onClick={() => onChange(s.key)}
              className="flex flex-col items-center gap-1.5 group min-w-0"
            >
              {/* Circle */}
              <div
                className={cn(
                  "flex items-center justify-center rounded-full transition-all duration-200",
                  "h-9 w-9 sm:h-10 sm:w-10 text-sm font-bold",
                  isDone || isPast
                    ? "bg-emerald-500 text-white"
                    : isActive
                      ? "bg-indigo-600 text-white ring-4 ring-indigo-500/30 scale-110"
                      : "bg-slate-800 text-slate-400 border-2 border-slate-600 hover:border-slate-400",
                )}
              >
                {isDone || isPast ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <s.icon className="h-4 w-4" />
                )}
              </div>
              {/* Label */}
              <span
                className={cn(
                  "hidden sm:block text-[11px] font-medium leading-none whitespace-nowrap transition-colors",
                  isActive ? "text-indigo-400" : isDone || isPast ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300",
                )}
              >
                {s.label}
              </span>
            </button>

            {/* Connector line */}
            {idx < sections.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-1 transition-all duration-300",
                  isPast || (isDone && idx < activeIdx - 1) ? "bg-emerald-500" : "bg-slate-700",
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================
export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const id = params.id;

  const rawSection = searchParams.get("section") as SectionKey | null;
  const section: SectionKey =
    rawSection && SECTIONS.some((s) => s.key === rawSection) ? rawSection : "overview";

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

  const sourceBomQuery = useQuery<{
    data: {
      lineId: string;
      templateId: string;
      templateCode: string;
      templateName: string;
      componentSku: string | null;
      componentName: string | null;
      metadata: Record<string, unknown>;
    } | null;
  }>({
    queryKey: ["work-orders", "source-bom", id],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${id}/source-bom`, { credentials: "include" });
      if (!res.ok) throw new Error("Không tải được nguồn BOM");
      return res.json();
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  const auditQuery = useQuery<{
    data: Array<{
      id: string;
      action: string;
      actorUsername: string | null;
      actorDisplayName: string | null;
      objectType: string;
      notes: string | null;
      occurredAt: string;
      afterJson: unknown;
    }>;
    meta: { total: number };
  }>({
    queryKey: ["work-orders", "audit", id],
    queryFn: async () => {
      const p = new URLSearchParams({ entity: "work_order", objectId: id, pageSize: "50" });
      const res = await fetch(`/api/admin/audit?${p.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Không tải được audit log");
      return res.json();
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  const progressLogQuery = useWoProgressLog(id);

  const roles = session.data?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isPlannerPlus = roles.includes("admin") || roles.includes("planner");
  const canOperate = roles.includes("admin") || roles.includes("planner") || roles.includes("operator");
  const canComplete = roles.includes("admin") || roles.includes("planner");

  const [defaultLineForReport, setDefaultLineForReport] = React.useState<string | null>(null);

  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <Skeleton className="h-16 w-full rounded-xl bg-slate-800" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-40 w-full rounded-xl bg-slate-800" />
          <Skeleton className="h-60 w-full rounded-xl bg-slate-800" />
        </div>
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <p className="text-sm text-red-400">Không tìm thấy Work Order.</p>
        <Button className="mt-2" variant="ghost" size="sm" onClick={() => router.push("/work-orders")}>
          <ChevronLeft className="h-3.5 w-3.5" />
          Quay lại
        </Button>
      </div>
    );
  }

  const totalRequired = wo.lines.reduce((acc, l) => acc + Number(l.requiredQty), 0);
  const totalCompleted = wo.lines.reduce((acc, l) => acc + Number(l.completedQty), 0);
  const progress = totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;
  const estimated = wo.estimatedHours ? Number(wo.estimatedHours) : null;
  const actual = wo.actualHours ? Number(wo.actualHours) : null;
  const tolerance = (wo.toleranceSpecs ?? null) as Record<string, unknown> | null;

  const activeIdx = SECTIONS.findIndex((s) => s.key === section);
  const sectionDoneMap: Record<SectionKey, boolean> = {
    overview: false,
    materials: false,
    routing: false,
    progress: false,
    qc: false,
    history: false,
  };

  const nextSection = activeIdx < SECTIONS.length - 1 ? SECTIONS[activeIdx + 1] : null;
  const prevSection = activeIdx > 0 ? SECTIONS[activeIdx - 1] : null;
  const goNext = () => { if (nextSection) setSection(nextSection.key); };
  const goPrev = () => { if (prevSection) setSection(prevSection.key); };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Top sticky bar ── */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {/* Row 1: Back + WO info + Actions */}
          <div className="flex items-center gap-3 py-3">
            <button
              type="button"
              onClick={() => router.push("/work-orders")}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors text-sm"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Quay lại</span>
            </button>

            <div className="h-5 w-px bg-slate-700 shrink-0" />

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Factory className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="font-mono text-base font-bold tracking-tight text-white truncate">
                {wo.woNo}
              </span>
              <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold shrink-0", STATUS_COLOR[wo.status])}>
                {STATUS_LABEL[wo.status]}
              </span>
              <span className="hidden sm:inline text-xs text-slate-500">
                · {wo.orderNo ?? "—"} · P{wo.priority}
              </span>
            </div>

            <div className="shrink-0">
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

          {/* Row 2: Horizontal Stepper */}
          <div className="pb-3">
            <HorizontalStepper
              sections={SECTIONS}
              active={section}
              sectionDoneMap={sectionDoneMap}
              onChange={setSection}
            />
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* ─────────────────────── SECTION: Tổng quan ─────────────────────── */}
        {section === "overview" && (
          <div className="space-y-6">
            {/* Hero row: ring + KPI cards */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
              {/* Left: progress ring + WO identity */}
              <div className="flex items-center gap-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <ProgressRing pct={progress} size={120} stroke={8} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Work Order</p>
                  <h1 className="font-mono text-2xl font-bold text-white">{wo.woNo}</h1>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", STATUS_COLOR[wo.status])}>
                      {STATUS_LABEL[wo.status]}
                    </span>
                    <span className="rounded-md border border-slate-700 px-2 py-0.5 text-[11px] font-mono text-slate-400">
                      P{wo.priority}
                    </span>
                  </div>
                  {/* Big gradient progress bar */}
                  <div className="mt-4 w-56">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 transition-all duration-700"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                      <span>{totalCompleted.toLocaleString("vi-VN")} done</span>
                      <span>{totalRequired.toLocaleString("vi-VN")} total</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: KPI 4-grid */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <DarkKpiCard label="Kế hoạch" value={Number(wo.plannedQty).toLocaleString("vi-VN")} unit="units" accent="slate" />
                <DarkKpiCard label="Đạt được" value={Number(wo.goodQty).toLocaleString("vi-VN")} unit="units" accent="emerald" />
                <DarkKpiCard label="Phế phẩm" value={Number(wo.scrapQty).toLocaleString("vi-VN")} unit="units" accent="red" />
                <DarkKpiCard
                  label="Giờ công"
                  value={actual !== null ? `${actual.toFixed(1)}` : estimated !== null ? `${estimated}` : "—"}
                  unit={actual !== null ? "h thực tế" : estimated !== null ? "h ước tính" : ""}
                  accent={actual !== null && estimated !== null && actual > estimated ? "red" : "indigo"}
                />
              </div>
            </div>

            {/* Source BOM + Order + Hours */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Source BOM */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  <Workflow className="h-3 w-3" /> Nguồn BOM
                </p>
                {sourceBomQuery.data?.data ? (
                  <>
                    <Link
                      href={`/bom/${sourceBomQuery.data.data.templateId}/grid`}
                      className="flex items-center gap-1 font-mono text-sm font-bold text-indigo-400 hover:text-indigo-300"
                    >
                      {sourceBomQuery.data.data.templateCode}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-400">{sourceBomQuery.data.data.templateName}</p>
                    {sourceBomQuery.data.data.componentSku && (
                      <p className="mt-1 font-mono text-xs text-emerald-400">{sourceBomQuery.data.data.componentSku}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-600">{sourceBomQuery.isLoading ? "Đang tải…" : "Chưa liên kết"}</p>
                )}
              </div>

              {/* Order */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Đơn hàng</p>
                <p className="font-mono text-sm font-bold text-white">{wo.orderNo ?? "—"}</p>
              </div>

              {/* Hours */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  <Clock className="h-3 w-3" /> Giờ công
                </p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ước tính</span>
                    <span className="font-mono font-semibold text-slate-300">{estimated !== null ? `${estimated}h` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Thực tế</span>
                    <span className={cn("font-mono font-semibold", actual !== null && estimated !== null && actual > estimated ? "text-red-400" : "text-slate-300")}>
                      {actual !== null ? `${actual.toFixed(1)}h` : "—"}
                    </span>
                  </div>
                  {estimated !== null && actual !== null && (
                    <div className={cn("rounded-md px-2 py-0.5 text-center text-[10px] font-semibold", actual > estimated ? "bg-red-900/50 text-red-400" : "bg-emerald-900/50 text-emerald-400")}>
                      {actual > estimated ? `Vượt ${(actual - estimated).toFixed(1)}h` : `Còn ${(estimated - actual).toFixed(1)}h`}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Timeline milestones horizontal */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <p className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <CalendarClock className="h-4 w-4 text-slate-500" />
                Hành trình Work Order
              </p>
              <div className="flex items-start gap-0 overflow-x-auto pb-2">
                {[
                  { label: "Tạo WO", time: wo.createdAt, always: true },
                  { label: "Phát hành", time: wo.releasedAt },
                  { label: "Bắt đầu SX", time: wo.startedAt },
                  { label: "Tạm dừng", time: wo.pausedAt, warning: true, note: wo.pausedReason ?? undefined },
                  { label: "Hoàn thành", time: wo.completedAt },
                ]
                  .filter((m) => m.always || m.time)
                  .map((m, i, arr) => (
                    <React.Fragment key={m.label}>
                      <div className="flex min-w-[120px] flex-col items-center gap-1.5 text-center">
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                            m.warning ? "bg-amber-900 text-amber-300" : m.time ? "bg-emerald-900 text-emerald-300" : "bg-slate-800 text-slate-500",
                          )}
                        >
                          {m.warning ? "!" : m.time ? "✓" : i + 1}
                        </div>
                        <p className={cn("text-[11px] font-semibold", m.warning ? "text-amber-400" : m.time ? "text-emerald-400" : "text-slate-500")}>
                          {m.label}
                        </p>
                        <p className="font-mono text-[10px] text-slate-600">
                          {m.time ? new Date(m.time).toLocaleDateString("vi-VN") : "—"}
                        </p>
                        {m.note && <p className="text-[10px] text-amber-500">· {m.note}</p>}
                      </div>
                      {i < arr.length - 1 && (
                        <div className="mt-4 h-0.5 flex-1 bg-slate-700" />
                      )}
                    </React.Fragment>
                  ))}
              </div>
            </div>

            {/* Technical specs */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <FileImage className="h-4 w-4 text-slate-500" /> Bản vẽ kỹ thuật
                </p>
                {wo.technicalDrawingUrl ? (
                  <a
                    href={wo.technicalDrawingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-indigo-400 hover:text-indigo-300 hover:border-indigo-700 transition-colors max-w-full truncate"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{wo.technicalDrawingUrl}</span>
                  </a>
                ) : (
                  <p className="text-xs text-slate-600">Chưa có bản vẽ.</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Ruler className="h-4 w-4 text-slate-500" /> Dung sai / Spec
                </p>
                {tolerance && Object.keys(tolerance).length > 0 ? (
                  <dl className="grid grid-cols-2 gap-1.5 text-xs">
                    {Object.entries(tolerance).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-slate-800 px-2.5 py-2">
                        <dt className="text-slate-500">{k}</dt>
                        <dd className="font-mono font-semibold text-slate-200">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-xs text-slate-600">Chưa khai báo dung sai.</p>
                )}
              </div>
            </div>

            {/* Notes */}
            {wo.notes && (
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Ghi chú</p>
                <p className="whitespace-pre-wrap text-sm text-slate-300">{wo.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* ─────────────────────── SECTION: Vật liệu ─────────────────────── */}
        {section === "materials" && (
          <div className="space-y-6">
            <SectionHeading icon={Package} title="Vật liệu & BOM" subtitle={`${wo.lines.length} lines sản xuất`} />
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
                <p className="text-sm font-semibold text-slate-200">Lines sản xuất</p>
                <span className="rounded-full bg-indigo-900/60 px-2.5 py-0.5 text-xs font-semibold text-indigo-400">
                  {wo.lines.length} items
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr className="border-b border-slate-800">
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
                  <tbody>
                    {wo.lines.map((l) => {
                      const req = Number(l.requiredQty);
                      const done = Number(l.completedQty);
                      const linePct = req > 0 ? Math.round((done / req) * 100) : 0;
                      const isDone = linePct >= 100;
                      const isRunning = linePct > 0 && linePct < 100;
                      return (
                        <tr key={l.id} className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
                          <td className="px-5 py-3.5 text-slate-500">{l.position}</td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-xs text-slate-400">{l.componentSku}</span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-200">{l.componentName}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-slate-400">{req.toLocaleString("vi-VN")}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-200">{done.toLocaleString("vi-VN")}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className={cn("h-full transition-all", isDone ? "bg-emerald-500" : isRunning ? "bg-gradient-to-r from-indigo-500 to-violet-500" : "bg-slate-700")}
                                  style={{ width: `${linePct}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums text-slate-500">{linePct}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {isDone ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" /> DONE
                              </span>
                            ) : isRunning ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-900/60 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">
                                <TrendingUp className="h-3 w-3" /> RUNNING
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                <AlertCircle className="h-3 w-3" /> PENDING
                              </span>
                            )}
                          </td>
                          {canOperate && (
                            <td className="px-5 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => { setDefaultLineForReport(l.id); setSection("progress"); }}
                                className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:border-indigo-600 hover:text-indigo-400 transition-colors"
                              >
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
              {/* Footer */}
              <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3">
                <span className="text-xs text-slate-500">
                  Tổng: <span className="font-semibold text-slate-300">{totalCompleted.toLocaleString("vi-VN")} / {totalRequired.toLocaleString("vi-VN")}</span> units
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-400">{progress}%</span>
                </div>
              </div>
            </div>

            <MaterialRequirementsTable
              woId={wo.id}
              requirements={wo.materialRequirements}
              versionLock={wo.versionLock}
              canEdit={isPlannerPlus}
            />
          </div>
        )}

        {/* ─────────────────────── SECTION: Quy trình ─────────────────────── */}
        {section === "routing" && (
          <div className="space-y-6">
            <SectionHeading icon={Workflow} title="Quy trình Sản xuất" subtitle="Routing plan và các bước gia công" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <FileImage className="h-4 w-4 text-slate-500" /> Bản vẽ kỹ thuật
                </p>
                {wo.technicalDrawingUrl ? (
                  <a
                    href={wo.technicalDrawingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors max-w-full truncate"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{wo.technicalDrawingUrl}</span>
                  </a>
                ) : (
                  <p className="text-xs text-slate-600">Chưa có bản vẽ.</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Ruler className="h-4 w-4 text-slate-500" /> Dung sai / Spec
                </p>
                {tolerance && Object.keys(tolerance).length > 0 ? (
                  <dl className="grid grid-cols-2 gap-1.5 text-xs">
                    {Object.entries(tolerance).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-slate-800 px-2.5 py-2">
                        <dt className="text-slate-500">{k}</dt>
                        <dd className="font-mono font-semibold text-slate-200">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-xs text-slate-600">Chưa khai báo dung sai.</p>
                )}
              </div>
            </div>
            <RoutingPlanEditor
              woId={wo.id}
              routingPlan={wo.routingPlan}
              versionLock={wo.versionLock}
              canEdit={isPlannerPlus}
            />
          </div>
        )}

        {/* ─────────────────────── SECTION: Tiến độ ─────────────────────── */}
        {section === "progress" && (
          <div className="space-y-6">
            <SectionHeading icon={TrendingUp} title="Tiến độ & Báo cáo" subtitle="Theo dõi và ghi nhận kết quả sản xuất" />

            {/* KPI 4 cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DarkKpiCard label="Kế hoạch" value={Number(wo.plannedQty).toLocaleString("vi-VN")} unit="units" accent="slate" />
              <DarkKpiCard label="Đạt được" value={Number(wo.goodQty).toLocaleString("vi-VN")} unit="units" accent="emerald" />
              <DarkKpiCard label="Phế phẩm" value={Number(wo.scrapQty).toLocaleString("vi-VN")} unit="units" accent="red" />
              <DarkKpiCard label="Hoàn thành" value={`${progress}%`} unit={`${totalCompleted}/${totalRequired}`} accent="indigo" />
            </div>

            {/* Big gradient progress bar */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-200">Tiến độ tổng thể</span>
                <span className="font-mono text-sm font-bold text-slate-300">
                  {totalCompleted.toLocaleString("vi-VN")} / {totalRequired.toLocaleString("vi-VN")} units
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-slate-600">0%</span>
                <span className={cn("font-bold", progress >= 100 ? "text-emerald-400" : "text-indigo-400")}>{progress}%</span>
                <span className="text-slate-600">100%</span>
              </div>
            </div>

            {/* Quick actions */}
            {wo.status !== "COMPLETED" && wo.status !== "CANCELLED" && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Thao tác nhanh</p>
                <WorkOrderActions
                  woId={wo.id}
                  status={wo.status}
                  versionLock={wo.versionLock}
                  canOperate={canOperate}
                  canComplete={canComplete}
                  canCancel={isAdmin}
                  size="sm"
                />
              </div>
            )}

            {/* Report form */}
            {canOperate && (wo.status === "IN_PROGRESS" || wo.status === "PAUSED") && (
              <div className="overflow-hidden rounded-2xl border border-indigo-800/60 bg-slate-900">
                <div className="flex items-center gap-3 border-b border-indigo-800/40 bg-gradient-to-r from-indigo-900/40 to-slate-900 px-5 py-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
                    <TrendingUp className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Báo cáo tiến độ</p>
                    <p className="text-xs text-slate-400">Ghi nhận kết quả sản xuất cho WO này</p>
                  </div>
                </div>
                <div className="p-5">
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
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 px-5 py-3">
                <p className="text-sm font-semibold text-slate-200">Chi tiết lines ({wo.lines.length})</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr className="border-b border-slate-800">
                      <th className="px-5 py-3 text-left">#</th>
                      <th className="px-5 py-3 text-left">SKU</th>
                      <th className="px-5 py-3 text-left">Tên</th>
                      <th className="px-5 py-3 text-right">Required</th>
                      <th className="px-5 py-3 text-right">Done</th>
                      <th className="px-5 py-3 text-left">Progress</th>
                      {canOperate && <th className="px-5 py-3" />}
                    </tr>
                  </thead>
                  <tbody>
                    {wo.lines.map((l) => {
                      const req = Number(l.requiredQty);
                      const done = Number(l.completedQty);
                      const linePct = req > 0 ? Math.round((done / req) * 100) : 0;
                      return (
                        <tr key={l.id} className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
                          <td className="px-5 py-3 text-slate-500">{l.position}</td>
                          <td className="px-5 py-3 font-mono text-xs text-slate-400">{l.componentSku}</td>
                          <td className="px-5 py-3 text-slate-200">{l.componentName}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-400">{req.toLocaleString("vi-VN")}</td>
                          <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-200">{done.toLocaleString("vi-VN")}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className={cn("h-full", linePct >= 100 ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-violet-500")}
                                  style={{ width: `${linePct}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums text-slate-500">{linePct}%</span>
                            </div>
                          </td>
                          {canOperate && (
                            <td className="px-5 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setDefaultLineForReport(l.id);
                                  document.getElementById("report-form-anchor")?.scrollIntoView({ behavior: "smooth" });
                                }}
                                className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:border-indigo-600 hover:text-indigo-400 transition-colors"
                              >
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

            <div id="report-form-anchor" />
            <ProgressTimeline woId={wo.id} />
          </div>
        )}

        {/* ─────────────────────── SECTION: QC ─────────────────────── */}
        {section === "qc" && (
          <div className="space-y-6">
            <SectionHeading icon={ShieldCheck} title="QC & Kiểm tra" subtitle="Checklist kiểm tra chất lượng sản phẩm" />
            <QcChecklistEnriched
              woId={wo.id}
              woStatus={wo.status}
              canEdit={canOperate || roles.includes("warehouse")}
              isAdmin={isAdmin}
            />
          </div>
        )}

        {/* ─────────────────────── SECTION: Lịch sử ─────────────────────── */}
        {section === "history" && (
          <div className="space-y-6">
            <SectionHeading icon={History} title="Lịch sử" subtitle="Audit log và lịch sử tiến độ gộp" />
            <AuditMergedTimeline
              woId={wo.id}
              auditRows={auditQuery.data?.data ?? []}
              progressRows={progressLogQuery.data?.data ?? []}
              isLoading={auditQuery.isLoading || progressLogQuery.isLoading}
              totalAudit={auditQuery.data?.meta.total ?? 0}
            />
          </div>
        )}

        {/* ── Bottom navigation ── */}
        <div className="mt-10 flex items-center justify-between border-t border-slate-800 pt-6">
          <button
            type="button"
            onClick={goPrev}
            disabled={activeIdx === 0}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
            {prevSection ? prevSection.label : "Quay lại"}
          </button>
          <span className="text-xs text-slate-600 font-mono">
            {SECTIONS[activeIdx]?.stepLabel ?? "—"} / {SECTIONS.length.toString().padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={!nextSection}
            className="flex items-center gap-2 rounded-xl border border-indigo-800 bg-indigo-900/40 px-4 py-2.5 text-sm font-medium text-indigo-400 hover:border-indigo-600 hover:bg-indigo-900/60 hover:text-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {nextSection ? nextSection.label : "Kết thúc"}
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// Dark KPI Card
// ============================================================================
function DarkKpiCard({
  label,
  value,
  unit,
  accent = "slate",
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: "slate" | "emerald" | "red" | "indigo";
}) {
  const accentMap: Record<string, string> = {
    slate: "border-slate-800 bg-slate-900 text-slate-200",
    emerald: "border-emerald-900/60 bg-emerald-900/20 text-emerald-300",
    red: "border-red-900/60 bg-red-900/20 text-red-300",
    indigo: "border-indigo-900/60 bg-indigo-900/20 text-indigo-300",
  };
  return (
    <div className={cn("rounded-xl border p-4", accentMap[accent])}>
      <p className="text-[10px] font-semibold uppercase tracking-widest opacity-60">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums">{value}</p>
      {unit && <p className="mt-0.5 text-[10px] opacity-50">{unit}</p>}
    </div>
  );
}

// ============================================================================
// Section Heading (dark)
// ============================================================================
function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-800/60 bg-indigo-900/30">
        <Icon className="h-5 w-5 text-indigo-400" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// Audit Merged Timeline (dark)
// ============================================================================
type AuditRow = {
  id: string;
  action: string;
  actorUsername: string | null;
  actorDisplayName: string | null;
  objectType: string;
  notes: string | null;
  occurredAt: string;
  afterJson: unknown;
};

type ProgressRow = {
  id: string;
  stepType: string;
  qtyCompleted: string;
  qtyScrap: string;
  notes: string | null;
  station: string | null;
  operatorUsername: string | null;
  operatorDisplayName: string | null;
  createdAt: string;
};

function AuditMergedTimeline({
  woId,
  auditRows,
  progressRows,
  isLoading,
  totalAudit,
}: {
  woId: string;
  auditRows: AuditRow[];
  progressRows: ProgressRow[];
  isLoading: boolean;
  totalAudit: number;
}) {
  const [filter, setFilter] = React.useState<"all" | "audit" | "progress">("all");

  type Merged =
    | { kind: "audit"; row: AuditRow; at: number }
    | { kind: "progress"; row: ProgressRow; at: number };

  const merged: Merged[] = React.useMemo(() => {
    const out: Merged[] = [];
    if (filter !== "progress") {
      for (const r of auditRows) out.push({ kind: "audit", row: r, at: new Date(r.occurredAt).getTime() });
    }
    if (filter !== "audit") {
      for (const r of progressRows) out.push({ kind: "progress", row: r, at: new Date(r.createdAt).getTime() });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 80);
  }, [auditRows, progressRows, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-300">Lịch sử thao tác</h3>
          <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-500">
            {totalAudit} audit · {progressRows.length} progress
          </span>
        </div>
        <Button asChild size="sm" variant="ghost" className="text-slate-400 hover:text-slate-200">
          <Link href={`/admin/audit?entity=work_order&objectId=${woId}`} className="text-xs">
            Xem đầy đủ
          </Link>
        </Button>
      </div>

      <div className="flex gap-1.5">
        {(["all", "audit", "progress"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f ? "bg-indigo-900 text-indigo-300" : "bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300",
            )}
          >
            {f === "all" ? "Tất cả" : f === "audit" ? "Audit" : "Tiến độ"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl bg-slate-800" />)}
        </div>
      ) : merged.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-xs text-slate-600">
          Chưa có sự kiện nào.
        </div>
      ) : (
        <ol className="space-y-2">
          {merged.map((m) =>
            m.kind === "audit" ? (
              <li key={`a-${m.row.id}`} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-xs">
                {/* Avatar */}
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-900 text-[10px] font-bold uppercase text-indigo-400">
                  {(m.row.actorDisplayName ?? m.row.actorUsername ?? "S").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-slate-200">
                      {m.row.actorDisplayName ?? m.row.actorUsername ?? "Hệ thống"}
                    </span>
                    <span className="rounded-md bg-indigo-900/60 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-indigo-400">
                      {m.row.action}
                    </span>
                  </div>
                  {m.row.notes && <p className="mt-0.5 text-slate-500">· {m.row.notes}</p>}
                  <p className="mt-0.5 font-mono text-[10px] text-slate-600">
                    {new Date(m.row.occurredAt).toLocaleString("vi-VN")}
                  </p>
                </div>
              </li>
            ) : (
              <li key={`p-${m.row.id}`} className="flex items-start gap-3 rounded-xl border border-emerald-900/40 bg-emerald-900/10 px-4 py-3 text-xs">
                {/* Avatar */}
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-900 text-[10px] font-bold uppercase text-emerald-400">
                  {(m.row.operatorDisplayName ?? m.row.operatorUsername ?? "OP").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-slate-200">
                      {m.row.operatorDisplayName ?? m.row.operatorUsername ?? "—"}
                    </span>
                    <span className="rounded-md bg-emerald-900/60 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-emerald-400">
                      {m.row.stepType}
                    </span>
                    {m.row.station && (
                      <span className="rounded-md bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">{m.row.station}</span>
                    )}
                    {Number(m.row.qtyCompleted) > 0 && (
                      <span className="rounded-md bg-emerald-900/40 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-emerald-400">
                        +{Number(m.row.qtyCompleted).toLocaleString("vi-VN")} đạt
                      </span>
                    )}
                    {Number(m.row.qtyScrap) > 0 && (
                      <span className="rounded-md bg-red-900/40 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-red-400">
                        {Number(m.row.qtyScrap).toLocaleString("vi-VN")} phế
                      </span>
                    )}
                  </div>
                  {m.row.notes && <p className="mt-0.5 text-slate-500 italic">· {m.row.notes}</p>}
                  <p className="mt-0.5 font-mono text-[10px] text-slate-600">
                    {new Date(m.row.createdAt).toLocaleString("vi-VN")}
                  </p>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}
