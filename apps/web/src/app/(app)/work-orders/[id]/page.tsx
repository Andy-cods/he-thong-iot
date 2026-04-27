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
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
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

/**
 * V2.0 — WO detail page redesign: Sidebar navigation + section content.
 *
 * Layout: Sticky top bar + [Sidebar (220px) | Main content (flex-1)]
 * Sections: overview | materials | routing | progress | qc | history
 * URL state: ?section=... via useSearchParams + router.replace
 */

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  DRAFT: "Nháp",
  QUEUED: "Hàng đợi",
  RELEASED: "Đã phát hành",
  IN_PROGRESS: "Đang chạy",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const STATUS_VARIANTS: Record<
  WorkOrderStatus,
  "default" | "outline" | "neutral" | "info" | "warning" | "success" | "danger"
> = {
  DRAFT: "outline",
  QUEUED: "neutral",
  RELEASED: "info",
  IN_PROGRESS: "info",
  PAUSED: "warning",
  COMPLETED: "success",
  CANCELLED: "danger",
};

type SectionKey = "overview" | "materials" | "routing" | "progress" | "qc" | "history";

// ============================================================================
// Progress Ring SVG
// ============================================================================

function ProgressRing({
  pct,
  size = 96,
  stroke = 6,
}: {
  pct: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const offset = C - (pct / 100) * C;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#e4e4e7"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={pct >= 100 ? "#10b981" : pct > 0 ? "#6366f1" : "#e4e4e7"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums text-zinc-800">
          {pct}%
        </span>
        <span className="text-[10px] text-zinc-500">hoàn thành</span>
      </div>
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
    rawSection &&
    ["overview", "materials", "routing", "progress", "qc", "history"].includes(
      rawSection,
    )
      ? rawSection
      : "overview";

  const setSection = React.useCallback(
    (key: SectionKey) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("section", key);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const query = useWorkOrderDetail(id);
  const wo = query.data?.data;

  // Source BOM lookup
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
      const res = await fetch(`/api/work-orders/${id}/source-bom`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Không tải được nguồn BOM");
      return res.json();
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  // Audit + progress log for history section
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
      const p = new URLSearchParams({
        entity: "work_order",
        objectId: id,
        pageSize: "50",
      });
      const res = await fetch(`/api/admin/audit?${p.toString()}`, {
        credentials: "include",
      });
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
  const canOperate =
    roles.includes("admin") ||
    roles.includes("planner") ||
    roles.includes("operator");
  const canComplete = roles.includes("admin") || roles.includes("planner");

  const [defaultLineForReport, setDefaultLineForReport] = React.useState<
    string | null
  >(null);

  if (query.isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-64" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">Không tìm thấy Work Order.</p>
        <Button
          className="mt-2"
          variant="ghost"
          size="sm"
          onClick={() => router.push("/work-orders")}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Quay lại
        </Button>
      </div>
    );
  }

  const totalRequired = wo.lines.reduce(
    (acc, l) => acc + Number(l.requiredQty),
    0,
  );
  const totalCompleted = wo.lines.reduce(
    (acc, l) => acc + Number(l.completedQty),
    0,
  );
  const progress =
    totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;

  const estimated = wo.estimatedHours ? Number(wo.estimatedHours) : null;
  const actual = wo.actualHours ? Number(wo.actualHours) : null;
  const tolerance = (wo.toleranceSpecs ?? null) as Record<
    string,
    unknown
  > | null;

  // Sidebar sections definition (built after wo is loaded so desc can use wo data)
  const SECTIONS: Array<{
    key: SectionKey;
    label: string;
    icon: React.ElementType;
    desc: string;
  }> = [
    {
      key: "overview",
      label: "Tổng quan",
      icon: LayoutDashboard,
      desc: "KPI & timeline",
    },
    {
      key: "materials",
      label: "Vật liệu & BOM",
      icon: Package,
      desc: `${wo.lines.length} lines`,
    },
    {
      key: "routing",
      label: "Quy trình SX",
      icon: Workflow,
      desc: "Routing plan",
    },
    {
      key: "progress",
      label: "Tiến độ & Báo cáo",
      icon: TrendingUp,
      desc: `${progress}% done`,
    },
    {
      key: "qc",
      label: "QC & Kiểm tra",
      icon: ShieldCheck,
      desc: "Checklist",
    },
    {
      key: "history",
      label: "Lịch sử",
      icon: History,
      desc: "Audit log",
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Sticky top bar ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/work-orders")}
            className="shrink-0"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Quay lại</span>
          </Button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 font-mono text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">
              <Factory className="h-4 w-4 shrink-0 text-zinc-500 sm:h-5 sm:w-5" />
              <span className="truncate">{wo.woNo}</span>
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
              <Badge variant={STATUS_VARIANTS[wo.status]}>
                {STATUS_LABEL[wo.status]}
              </Badge>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">
                Order: {wo.orderNo ?? "—"}
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">
                Ưu tiên: {wo.priority}
              </span>
            </div>
          </div>
        </div>
        <WorkOrderActions
          woId={wo.id}
          status={wo.status}
          versionLock={wo.versionLock}
          canOperate={canOperate}
          canComplete={canComplete}
          canCancel={isAdmin}
        />
      </header>

      {/* ── Mobile horizontal chip nav (< lg) ── */}
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-3 py-1.5 lg:hidden">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
              section === s.key
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
            )}
          >
            <s.icon className="h-3 w-3" />
            {s.label}
          </button>
        ))}
      </nav>

      {/* ── Body: sidebar + content ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar — hidden on mobile, visible lg+ */}
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white lg:block">
          <nav className="p-3">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Các mục
            </p>
            <div className="space-y-0.5">
              {SECTIONS.map((s) => {
                const isActive = section === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSection(s.key)}
                    className={cn(
                      "group w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      isActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                    )}
                  >
                    <s.icon
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        isActive
                          ? "text-indigo-600"
                          : "text-zinc-400 group-hover:text-zinc-600",
                      )}
                    />
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-sm leading-none",
                          isActive ? "font-semibold" : "font-medium",
                        )}
                      >
                        {s.label}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        {s.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </nav>
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto bg-zinc-50">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
            {/* ── SECTION: Tổng quan ── */}
            {section === "overview" && (
              <div className="space-y-4">
                <SectionHeading
                  icon={LayoutDashboard}
                  title="Tổng quan"
                  subtitle="Thông tin chung và hành trình của Work Order"
                />

                {/* ID row */}
                <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    ID
                  </span>
                  <code className="flex-1 truncate font-mono text-xs text-zinc-700">
                    {wo.id}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(wo.id);
                      toast.success("Đã copy WO ID");
                    }}
                    className="h-7 shrink-0 px-2 text-xs"
                  >
                    Copy
                  </Button>
                </div>

                {/* Hero + stats grid */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {/* Hero card (2/3) */}
                  <div className="lg:col-span-2">
                    <div className="rounded-xl border border-zinc-200 bg-white p-5">
                      <div className="flex items-start gap-5">
                        <ProgressRing pct={progress} size={96} stroke={8} />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xl font-bold tracking-tight text-zinc-900">
                              {wo.woNo}
                            </span>
                            <Badge variant={STATUS_VARIANTS[wo.status]}>
                              {STATUS_LABEL[wo.status]}
                            </Badge>
                            <Badge variant="outline">
                              P{wo.priority}
                            </Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <MiniStat
                              label="Kế hoạch"
                              value={Number(wo.plannedQty).toLocaleString(
                                "vi-VN",
                              )}
                            />
                            <MiniStat
                              label="Đạt"
                              value={Number(wo.goodQty).toLocaleString("vi-VN")}
                              tone="emerald"
                            />
                            <MiniStat
                              label="Phế"
                              value={Number(wo.scrapQty).toLocaleString(
                                "vi-VN",
                              )}
                              tone="red"
                            />
                            <MiniStat
                              label="Giờ công"
                              value={
                                actual !== null
                                  ? `${actual.toFixed(1)}h`
                                  : estimated !== null
                                    ? `${estimated}h (KH)`
                                    : "—"
                              }
                              tone={
                                actual !== null &&
                                estimated !== null &&
                                actual > estimated
                                  ? "red"
                                  : "zinc"
                              }
                            />
                          </div>
                          {/* Progress bar */}
                          <div className="mt-3 flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
                              <div
                                className={cn(
                                  "h-full transition-all",
                                  progress >= 100
                                    ? "bg-emerald-500"
                                    : "bg-indigo-600",
                                )}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono text-zinc-600">
                              {totalCompleted.toLocaleString("vi-VN")} /{" "}
                              {totalRequired.toLocaleString("vi-VN")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right column (1/3) */}
                  <div className="space-y-3">
                    {/* Source BOM card */}
                    {sourceBomQuery.data?.data ? (
                      (() => {
                        const src = sourceBomQuery.data.data!;
                        return (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                              <Workflow className="h-3.5 w-3.5" />
                              Nguồn BOM
                            </div>
                            <Link
                              href={`/bom/${src.templateId}/grid`}
                              className="flex items-center gap-1 font-mono text-sm font-semibold text-emerald-700 hover:underline"
                            >
                              {src.templateCode}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </Link>
                            <p className="mt-0.5 text-xs text-emerald-800">
                              {src.templateName}
                            </p>
                            {src.componentSku && (
                              <p className="mt-1 text-xs text-emerald-700">
                                <span className="text-emerald-600">
                                  Linh kiện:{" "}
                                </span>
                                <span className="font-mono font-semibold">
                                  {src.componentSku}
                                </span>
                              </p>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="rounded-xl border border-zinc-200 bg-white p-4">
                        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                          <Workflow className="h-3.5 w-3.5" />
                          Nguồn BOM
                        </div>
                        <p className="text-xs text-zinc-400">
                          {sourceBomQuery.isLoading
                            ? "Đang tải..."
                            : "Chưa liên kết BOM."}
                        </p>
                      </div>
                    )}

                    {/* Order card */}
                    <div className="rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="mb-1 text-xs font-semibold text-zinc-500">
                        Đơn hàng
                      </div>
                      <p className="font-mono text-sm font-semibold text-zinc-800">
                        {wo.orderNo ?? "—"}
                      </p>
                    </div>

                    {/* Hours card */}
                    {(estimated || actual) && (
                      <div className="rounded-xl border border-zinc-200 bg-white p-4">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                          <Clock className="h-3.5 w-3.5" />
                          Giờ công
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Ước tính</span>
                            <span className="font-mono font-semibold text-zinc-800">
                              {estimated !== null ? `${estimated}h` : "—"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Thực tế</span>
                            <span
                              className={cn(
                                "font-mono font-semibold",
                                actual !== null &&
                                  estimated !== null &&
                                  actual > estimated
                                  ? "text-red-600"
                                  : "text-zinc-800",
                              )}
                            >
                              {actual !== null ? `${actual.toFixed(1)}h` : "—"}
                            </span>
                          </div>
                          {estimated !== null && actual !== null && (
                            <div className="mt-1 pt-1 border-t border-zinc-100">
                              <Badge
                                variant={
                                  actual > estimated ? "danger" : "success"
                                }
                                size="sm"
                              >
                                {actual > estimated
                                  ? `Vượt ${(actual - estimated).toFixed(1)}h`
                                  : `Còn ${(estimated - actual).toFixed(1)}h`}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Timeline card */}
                <div className="rounded-xl border border-zinc-200 bg-white p-5">
                  <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-800">
                    <CalendarClock className="h-4 w-4 text-zinc-500" />
                    Hành trình Work Order
                  </div>
                  <div className="space-y-0">
                    <TimelineRow
                      label="Tạo WO"
                      time={wo.createdAt}
                      active
                      done
                    />
                    <TimelineRow
                      label="Phát hành"
                      time={wo.releasedAt}
                      active={!!wo.releasedAt}
                      done={!!wo.releasedAt}
                    />
                    <TimelineRow
                      label="Bắt đầu"
                      time={wo.startedAt}
                      active={!!wo.startedAt}
                      done={!!wo.startedAt}
                    />
                    {wo.pausedAt && (
                      <TimelineRow
                        label="Tạm dừng"
                        time={wo.pausedAt}
                        active
                        warning
                        note={wo.pausedReason ?? undefined}
                      />
                    )}
                    <TimelineRow
                      label="Hoàn thành"
                      time={wo.completedAt}
                      active={!!wo.completedAt}
                      done={!!wo.completedAt}
                      last
                    />
                  </div>
                </div>

                {/* Technical drawing + tolerance */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      <FileImage className="h-4 w-4 text-zinc-500" />
                      Bản vẽ kỹ thuật
                    </div>
                    {wo.technicalDrawingUrl ? (
                      <a
                        href={wo.technicalDrawingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-indigo-700 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{wo.technicalDrawingUrl}</span>
                      </a>
                    ) : (
                      <p className="text-xs text-zinc-400">Chưa có bản vẽ.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      <Ruler className="h-4 w-4 text-zinc-500" />
                      Dung sai / Spec kỹ thuật
                    </div>
                    {tolerance && Object.keys(tolerance).length > 0 ? (
                      <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                        {Object.entries(tolerance).map(([k, v]) => (
                          <div
                            key={k}
                            className="flex items-start gap-2 rounded-md bg-zinc-50 px-2 py-1.5"
                          >
                            <dt className="font-semibold text-zinc-700">
                              {k}:
                            </dt>
                            <dd className="font-mono text-zinc-900">
                              {typeof v === "string" ? v : JSON.stringify(v)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-xs text-zinc-400">
                        Chưa khai báo dung sai.
                      </p>
                    )}
                  </div>
                </div>

                {/* Source BOM full detail */}
                {sourceBomQuery.data?.data &&
                  (() => {
                    const src = sourceBomQuery.data.data!;
                    const routing = (src.metadata?.routing ?? {}) as {
                      materialCode?: string;
                      materialName?: string;
                      blankSize?: string;
                      processRoute?: string[];
                      estimatedHours?: number;
                      technicalNotes?: string;
                    };
                    const hasExtras =
                      routing.processRoute?.length ||
                      routing.materialCode ||
                      routing.technicalNotes;
                    if (!hasExtras) return null;
                    return (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                          <Workflow className="h-4 w-4" />
                          Chi tiết BOM — {src.templateCode}
                        </div>
                        <div className="grid grid-cols-1 gap-2 text-xs text-emerald-900 sm:grid-cols-2">
                          {routing.materialCode && (
                            <div>
                              Vật liệu:{" "}
                              <span className="font-mono font-semibold">
                                {routing.materialCode}
                              </span>
                              {routing.materialName
                                ? ` — ${routing.materialName}`
                                : ""}
                            </div>
                          )}
                        </div>
                        {routing.processRoute &&
                          routing.processRoute.length > 0 && (
                            <div className="mt-2 text-xs">
                              <span className="mr-1 font-semibold text-emerald-800">
                                Quy trình BOM:
                              </span>
                              <span className="font-mono text-emerald-700">
                                {routing.processRoute.join(" → ")}
                              </span>
                            </div>
                          )}
                        {routing.technicalNotes && (
                          <div className="mt-2 rounded-md border border-emerald-200 bg-white p-2 text-xs text-emerald-900">
                            <span className="font-semibold">
                              Ghi chú kỹ thuật:
                            </span>{" "}
                            {routing.technicalNotes}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {/* Notes */}
                {wo.notes && (
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Ghi chú
                    </div>
                    <div className="whitespace-pre-wrap text-sm text-zinc-800">
                      {wo.notes}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SECTION: Vật liệu & BOM ── */}
            {section === "materials" && (
              <div className="space-y-4">
                <SectionHeading
                  icon={Package}
                  title="Vật liệu & BOM"
                  subtitle="Danh sách vật liệu yêu cầu theo Work Order"
                  badge={`${wo.lines.length} lines`}
                />

                {/* Lines table with progress bars */}
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                  <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                    <div className="text-sm font-semibold text-zinc-800">
                      Lines sản xuất
                    </div>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                      {wo.lines.length} items
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50/60 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-4 py-2.5 text-left">#</th>
                          <th className="px-4 py-2.5 text-left">SKU</th>
                          <th className="px-4 py-2.5 text-left">Tên</th>
                          <th className="px-4 py-2.5 text-right">Yêu cầu</th>
                          <th className="px-4 py-2.5 text-right">Hoàn thành</th>
                          <th className="px-4 py-2.5 text-left">Tiến độ</th>
                          <th className="px-4 py-2.5 text-center">Trạng thái</th>
                          {canOperate && (
                            <th className="px-4 py-2.5 text-right" />
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {wo.lines.map((l) => {
                          const req = Number(l.requiredQty);
                          const done = Number(l.completedQty);
                          const linePct =
                            req > 0 ? Math.round((done / req) * 100) : 0;
                          const isDone = linePct >= 100;
                          const isRunning = linePct > 0 && linePct < 100;
                          return (
                            <tr
                              key={l.id}
                              className="hover:bg-zinc-50 transition-colors"
                            >
                              <td className="px-4 py-3 text-zinc-500">
                                {l.position}
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono text-xs text-zinc-700">
                                  {l.componentSku}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-zinc-800">
                                {l.componentName}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                                {req.toLocaleString("vi-VN")}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-semibold text-zinc-800">
                                {done.toLocaleString("vi-VN")}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-28 overflow-hidden rounded-full bg-zinc-200">
                                    <div
                                      className={cn(
                                        "h-full transition-all",
                                        isDone
                                          ? "bg-emerald-500"
                                          : isRunning
                                            ? "bg-indigo-500"
                                            : "bg-zinc-300",
                                      )}
                                      style={{ width: `${linePct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs tabular-nums text-zinc-500">
                                    {linePct}%
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isDone ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    <CheckCircle2 className="h-3 w-3" />
                                    DONE
                                  </span>
                                ) : isRunning ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                    <TrendingUp className="h-3 w-3" />
                                    RUNNING
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
                                    <AlertCircle className="h-3 w-3" />
                                    PENDING
                                  </span>
                                )}
                              </td>
                              {canOperate && (
                                <td className="px-4 py-3 text-right">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setDefaultLineForReport(l.id);
                                      setSection("progress");
                                    }}
                                    className="h-7 text-[11px]"
                                  >
                                    + Báo cáo
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Footer summary */}
                  <div className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">
                        Tổng:{" "}
                        <span className="font-semibold text-zinc-800">
                          {totalCompleted.toLocaleString("vi-VN")} /{" "}
                          {totalRequired.toLocaleString("vi-VN")}
                        </span>{" "}
                        units
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 overflow-hidden rounded-full bg-zinc-200">
                          <div
                            className={cn(
                              "h-full transition-all",
                              progress >= 100
                                ? "bg-emerald-500"
                                : "bg-indigo-500",
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="font-mono font-semibold text-zinc-700">
                          {progress}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Material requirements component */}
                <MaterialRequirementsTable
                  woId={wo.id}
                  requirements={wo.materialRequirements}
                  versionLock={wo.versionLock}
                  canEdit={isPlannerPlus}
                />
              </div>
            )}

            {/* ── SECTION: Quy trình SX ── */}
            {section === "routing" && (
              <div className="space-y-4">
                <SectionHeading
                  icon={Workflow}
                  title="Quy trình Sản xuất"
                  subtitle="Routing plan và các bước gia công"
                />

                {/* Technical drawing + tolerance header */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      <FileImage className="h-4 w-4 text-zinc-500" />
                      Bản vẽ kỹ thuật
                    </div>
                    {wo.technicalDrawingUrl ? (
                      <a
                        href={wo.technicalDrawingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-indigo-700 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{wo.technicalDrawingUrl}</span>
                      </a>
                    ) : (
                      <p className="text-xs text-zinc-400">Chưa có bản vẽ.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      <Ruler className="h-4 w-4 text-zinc-500" />
                      Dung sai / Spec kỹ thuật
                    </div>
                    {tolerance && Object.keys(tolerance).length > 0 ? (
                      <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                        {Object.entries(tolerance).map(([k, v]) => (
                          <div
                            key={k}
                            className="flex items-start gap-2 rounded-md bg-zinc-50 px-2 py-1.5"
                          >
                            <dt className="font-semibold text-zinc-700">
                              {k}:
                            </dt>
                            <dd className="font-mono text-zinc-900">
                              {typeof v === "string" ? v : JSON.stringify(v)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-xs text-zinc-400">
                        Chưa khai báo dung sai.
                      </p>
                    )}
                  </div>
                </div>

                {/* Routing plan editor */}
                <RoutingPlanEditor
                  woId={wo.id}
                  routingPlan={wo.routingPlan}
                  versionLock={wo.versionLock}
                  canEdit={isPlannerPlus}
                />
              </div>
            )}

            {/* ── SECTION: Tiến độ & Báo cáo ── */}
            {section === "progress" && (
              <div className="space-y-4">
                <SectionHeading
                  icon={TrendingUp}
                  title="Tiến độ & Báo cáo"
                  subtitle="Theo dõi tiến độ sản xuất và ghi nhận kết quả"
                />

                {/* KPI strip */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard
                    label="Kế hoạch"
                    value={Number(wo.plannedQty).toLocaleString("vi-VN")}
                    tone="zinc"
                  />
                  <KpiCard
                    label="Đạt"
                    value={Number(wo.goodQty).toLocaleString("vi-VN")}
                    tone="emerald"
                  />
                  <KpiCard
                    label="Phế"
                    value={Number(wo.scrapQty).toLocaleString("vi-VN")}
                    tone="red"
                  />
                  <KpiCard
                    label="% Hoàn thành"
                    value={`${progress}%`}
                    tone="indigo"
                  />
                </div>

                {/* Progress bar tổng — to, rõ */}
                <div className="rounded-xl border border-zinc-200 bg-white p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-800">
                      Tiến độ tổng
                    </span>
                    <span className="font-mono text-sm font-semibold text-zinc-700">
                      {totalCompleted.toLocaleString("vi-VN")} /{" "}
                      {totalRequired.toLocaleString("vi-VN")} units
                    </span>
                  </div>
                  <div className="h-4 w-full overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        progress >= 100
                          ? "bg-emerald-500"
                          : progress > 0
                            ? "bg-indigo-600"
                            : "bg-zinc-300",
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                    <span>0%</span>
                    <span
                      className={cn(
                        "font-semibold",
                        progress >= 100
                          ? "text-emerald-600"
                          : "text-indigo-600",
                      )}
                    >
                      {progress}%
                    </span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Action buttons */}
                {wo.status !== "COMPLETED" && wo.status !== "CANCELLED" && (
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="mb-3 text-sm font-semibold text-zinc-700">
                      Thao tác nhanh
                    </div>
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

                {/* Form báo cáo — nổi bật nếu WO đang chạy */}
                {canOperate &&
                  (wo.status === "IN_PROGRESS" ||
                    wo.status === "PAUSED") && (
                    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-1">
                      <div className="rounded-lg bg-white p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600">
                            <TrendingUp className="h-3.5 w-3.5 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-zinc-800">
                              Báo cáo tiến độ
                            </p>
                            <p className="text-xs text-zinc-500">
                              Ghi nhận kết quả sản xuất cho WO này
                            </p>
                          </div>
                        </div>
                        <ProgressReportForm
                          woId={wo.id}
                          lines={wo.lines}
                          defaultLineId={defaultLineForReport}
                          onSubmitted={() => setDefaultLineForReport(null)}
                        />
                      </div>
                    </div>
                  )}

                {/* Lines table compact */}
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                  <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                    <div className="text-sm font-semibold text-zinc-800">
                      Chi tiết lines ({wo.lines.length})
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50/60 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-4 py-2.5 text-left">#</th>
                          <th className="px-4 py-2.5 text-left">SKU</th>
                          <th className="px-4 py-2.5 text-left">Tên</th>
                          <th className="px-4 py-2.5 text-right">Required</th>
                          <th className="px-4 py-2.5 text-right">Done</th>
                          <th className="px-4 py-2.5 text-left">Progress</th>
                          {canOperate && (
                            <th className="px-4 py-2.5 text-right" />
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {wo.lines.map((l) => {
                          const req = Number(l.requiredQty);
                          const done = Number(l.completedQty);
                          const linePct =
                            req > 0 ? Math.round((done / req) * 100) : 0;
                          return (
                            <tr
                              key={l.id}
                              className="hover:bg-zinc-50 transition-colors"
                            >
                              <td className="px-4 py-2.5 text-zinc-500">
                                {l.position}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-xs text-zinc-700">
                                {l.componentSku}
                              </td>
                              <td className="px-4 py-2.5 text-zinc-800">
                                {l.componentName}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">
                                {req.toLocaleString("vi-VN")}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-zinc-800">
                                {done.toLocaleString("vi-VN")}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200">
                                    <div
                                      className={cn(
                                        "h-full",
                                        linePct >= 100
                                          ? "bg-emerald-500"
                                          : "bg-indigo-500",
                                      )}
                                      style={{ width: `${linePct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs tabular-nums text-zinc-500">
                                    {linePct}%
                                  </span>
                                </div>
                              </td>
                              {canOperate && (
                                <td className="px-4 py-2.5 text-right">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setDefaultLineForReport(l.id);
                                      const el = document.getElementById(
                                        "progress-report-anchor",
                                      );
                                      el?.scrollIntoView({
                                        behavior: "smooth",
                                      });
                                    }}
                                    className="h-7 text-[11px]"
                                  >
                                    + Báo cáo
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div id="progress-report-anchor" />
                <ProgressTimeline woId={wo.id} />
              </div>
            )}

            {/* ── SECTION: QC & Kiểm tra ── */}
            {section === "qc" && (
              <div className="space-y-4">
                <SectionHeading
                  icon={ShieldCheck}
                  title="QC & Kiểm tra"
                  subtitle="Checklist kiểm tra chất lượng sản phẩm"
                />
                <QcChecklistEnriched
                  woId={wo.id}
                  woStatus={wo.status}
                  canEdit={canOperate || roles.includes("warehouse")}
                  isAdmin={isAdmin}
                />
              </div>
            )}

            {/* ── SECTION: Lịch sử ── */}
            {section === "history" && (
              <div className="space-y-4">
                <SectionHeading
                  icon={History}
                  title="Lịch sử"
                  subtitle="Audit log và lịch sử tiến độ gộp"
                />
                <AuditMergedTimeline
                  woId={wo.id}
                  auditRows={auditQuery.data?.data ?? []}
                  progressRows={progressLogQuery.data?.data ?? []}
                  isLoading={
                    auditQuery.isLoading || progressLogQuery.isLoading
                  }
                  totalAudit={auditQuery.data?.meta.total ?? 0}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// Section Heading helper
// ============================================================================

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50">
          <Icon className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          {subtitle && (
            <p className="text-xs text-zinc-500">{subtitle}</p>
          )}
        </div>
      </div>
      {badge && (
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
          {badge}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// MiniStat — tiny stat for hero card
// ============================================================================

function MiniStat({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: string;
  tone?: "zinc" | "emerald" | "red" | "indigo";
}) {
  const toneClass: Record<string, string> = {
    zinc: "text-zinc-900",
    emerald: "text-emerald-700",
    red: "text-red-600",
    indigo: "text-indigo-700",
  };
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </p>
      <p className={cn("mt-0.5 font-mono text-sm font-bold tabular-nums", toneClass[tone])}>
        {value}
      </p>
    </div>
  );
}

// ============================================================================
// Audit merged timeline
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
  const [filter, setFilter] = React.useState<"all" | "audit" | "progress">(
    "all",
  );

  type Merged =
    | { kind: "audit"; row: AuditRow; at: number }
    | { kind: "progress"; row: ProgressRow; at: number };

  const merged: Merged[] = React.useMemo(() => {
    const out: Merged[] = [];
    if (filter !== "progress") {
      for (const r of auditRows) {
        out.push({
          kind: "audit",
          row: r,
          at: new Date(r.occurredAt).getTime(),
        });
      }
    }
    if (filter !== "audit") {
      for (const r of progressRows) {
        out.push({
          kind: "progress",
          row: r,
          at: new Date(r.createdAt).getTime(),
        });
      }
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 80);
  }, [auditRows, progressRows, filter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-800">
            Lịch sử thao tác (gộp)
          </h3>
          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">
            audit {totalAudit} · progress {progressRows.length}
          </span>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link
            href={`/admin/audit?entity=work_order&objectId=${woId}`}
            className="text-xs"
          >
            Xem đầy đủ
          </Link>
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5">
        {(["all", "audit", "progress"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f
                ? "bg-indigo-100 text-indigo-800"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
            )}
          >
            {f === "all" ? "Tất cả" : f === "audit" ? "Audit" : "Tiến độ"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : merged.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-xs text-zinc-500">
          Chưa có sự kiện nào.
        </div>
      ) : (
        <ol className="space-y-1.5">
          {merged.map((m) =>
            m.kind === "audit" ? (
              <li
                key={`a-${m.row.id}`}
                className="flex items-start gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3 text-xs"
              >
                <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-indigo-50 px-1.5 font-mono text-[10px] font-semibold uppercase text-indigo-700">
                  {m.row.action}
                </span>
                <div className="flex-1">
                  <div className="text-zinc-800">
                    <span className="font-semibold">
                      {m.row.actorDisplayName ??
                        m.row.actorUsername ??
                        "Hệ thống"}
                    </span>
                    {m.row.notes ? (
                      <span className="ml-1 text-zinc-600">
                        · {m.row.notes}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-zinc-400">
                    {new Date(m.row.occurredAt).toLocaleString("vi-VN")}
                  </div>
                </div>
              </li>
            ) : (
              <li
                key={`p-${m.row.id}`}
                className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/30 px-4 py-3 text-xs"
              >
                <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-emerald-100 px-1.5 font-mono text-[10px] font-semibold uppercase text-emerald-700">
                  {m.row.stepType}
                </span>
                <div className="flex-1">
                  <div className="text-zinc-800">
                    <span className="font-semibold">
                      {m.row.operatorDisplayName ??
                        m.row.operatorUsername ??
                        "—"}
                    </span>
                    {m.row.station ? (
                      <span className="ml-2 rounded-md bg-white px-1.5 font-mono text-[10px] text-zinc-600">
                        {m.row.station}
                      </span>
                    ) : null}
                    {Number(m.row.qtyCompleted) > 0 && (
                      <span className="ml-2 rounded-md bg-emerald-100 px-1.5 font-mono text-[10px] text-emerald-700">
                        +{Number(m.row.qtyCompleted).toLocaleString("vi-VN")}{" "}
                        đạt
                      </span>
                    )}
                    {Number(m.row.qtyScrap) > 0 && (
                      <span className="ml-2 rounded-md bg-red-100 px-1.5 font-mono text-[10px] text-red-700">
                        {Number(m.row.qtyScrap).toLocaleString("vi-VN")} phế
                      </span>
                    )}
                    {m.row.notes ? (
                      <span className="ml-1 block text-zinc-700">
                        · {m.row.notes}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-zinc-400">
                    {new Date(m.row.createdAt).toLocaleString("vi-VN")}
                  </div>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}

// ============================================================================
// Helper presentational components
// ============================================================================

function KpiCard({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: string;
  tone?: "zinc" | "emerald" | "red" | "indigo";
}) {
  const toneClasses: Record<string, string> = {
    zinc: "border-zinc-200 bg-white text-zinc-900",
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-900",
    red: "border-red-200 bg-red-50/60 text-red-900",
    indigo: "border-indigo-200 bg-indigo-50/60 text-indigo-900",
  };
  return (
    <div className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function TimelineRow({
  label,
  time,
  active,
  done,
  warning,
  note,
  last,
}: {
  label: string;
  time: string | null | undefined;
  active?: boolean;
  done?: boolean;
  warning?: boolean;
  note?: string;
  last?: boolean;
}) {
  const dotClass = done
    ? "bg-emerald-500 ring-2 ring-emerald-200"
    : warning
      ? "bg-amber-500 ring-2 ring-amber-200"
      : active
        ? "bg-indigo-500 ring-2 ring-indigo-200"
        : "bg-zinc-300";
  return (
    <div className="flex items-start gap-4 pb-4">
      <div className="flex flex-col items-center pt-0.5">
        <div className={`h-3 w-3 rounded-full ${dotClass} shrink-0`} />
        {!last && <div className="mt-1.5 h-8 w-px bg-zinc-200" />}
      </div>
      <div className="min-w-0 flex-1 pb-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold text-zinc-700">{label}</span>
          <span className="font-mono text-xs text-zinc-400">
            {time ? new Date(time).toLocaleString("vi-VN") : "—"}
          </span>
        </div>
        {note && (
          <div className="mt-0.5 text-xs text-amber-700">· {note}</div>
        )}
      </div>
    </div>
  );
}
