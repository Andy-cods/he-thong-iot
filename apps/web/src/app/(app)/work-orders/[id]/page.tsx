"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ProgressReportForm } from "@/components/work-orders/ProgressReportForm";
import { ProgressTimeline } from "@/components/work-orders/ProgressTimeline";
import { RoutingPlanEditor } from "@/components/work-orders/RoutingPlanEditor";
import { MaterialRequirementsTable } from "@/components/work-orders/MaterialRequirementsTable";
import { QcChecklistEnriched } from "@/components/work-orders/QcChecklistEnriched";
import { WorkOrderActions } from "@/components/work-orders/WorkOrderActions";
import { useSession } from "@/hooks/useSession";
import {
  useWoProgressLog,
  useWorkOrderDetail,
  type WorkOrderStatus,
} from "@/hooks/useWorkOrders";

/**
 * V1.9 Phase 4 — WO detail page redesign cực chi tiết.
 *
 * 4 tab:
 *  - Thông tin: KPI + timeline + routing + materials + tolerance + tech draw
 *  - Tiến độ: form báo cáo + timeline + lines progress + action buttons
 *  - QC Checks: checklist items per stage (PASS/FAIL/NA/PENDING)
 *  - Audit: merged audit_event + wo_progress_log timeline
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

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const id = params.id;

  const query = useWorkOrderDetail(id);
  const wo = query.data?.data;

  // V1.7-beta.2.6 — Source BOM lookup.
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

  // Audit + progress log merged for tab Audit.
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/work-orders")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Quay lại
          </Button>
          <div>
            <h1 className="font-mono text-lg font-semibold tracking-tight text-zinc-900">
              <Factory className="mr-1 inline-block h-5 w-5 text-zinc-500" />
              {wo.woNo}
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
              <Badge variant={STATUS_VARIANTS[wo.status]}>
                {STATUS_LABEL[wo.status]}
              </Badge>
              <span>·</span>
              <span>Order: {wo.orderNo ?? "—"}</span>
              <span>·</span>
              <span>Ưu tiên: {wo.priority}</span>
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

      <Tabs defaultValue="info" className="flex-1 overflow-hidden">
        <TabsList className="mx-6 mt-3">
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="progress">Tiến độ</TabsTrigger>
          <TabsTrigger value="qc">QC Checks</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="overflow-auto px-6 py-4 space-y-4">
          {/* ID row + copy */}
          <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              ID
            </span>
            <code className="flex-1 font-mono text-xs text-zinc-700">
              {wo.id}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(wo.id);
                toast.success("Đã copy WO ID");
              }}
              className="h-7 px-2 text-xs"
            >
              Copy
            </Button>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <InfoCard
              label="Kế hoạch"
              value={Number(wo.plannedQty).toLocaleString("vi-VN")}
            />
            <InfoCard
              label="Đạt"
              value={Number(wo.goodQty).toLocaleString("vi-VN")}
              tone="emerald"
            />
            <InfoCard
              label="Phế"
              value={Number(wo.scrapQty).toLocaleString("vi-VN")}
              tone="red"
            />
            <InfoCard
              label="Ước tính giờ"
              value={estimated !== null ? `${estimated}h` : "—"}
            />
            <InfoCard
              label="Giờ thực tế"
              value={actual !== null ? `${actual.toFixed(1)}h` : "—"}
              tone={
                actual !== null && estimated !== null && actual > estimated
                  ? "red"
                  : "zinc"
              }
            />
            <InfoCard
              label="Line"
              value={String(wo.lines.length)}
              tone="indigo"
            />
          </div>

          {/* Timeline */}
          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-zinc-600">
              <CalendarClock className="h-3.5 w-3.5" />
              Trục thời gian
            </div>
            <TimelineRow label="Tạo WO" time={wo.createdAt} active done />
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

          {/* Routing plan */}
          <RoutingPlanEditor
            woId={wo.id}
            routingPlan={wo.routingPlan}
            versionLock={wo.versionLock}
            canEdit={isPlannerPlus}
          />

          {/* Material requirements */}
          <MaterialRequirementsTable
            woId={wo.id}
            requirements={wo.materialRequirements}
            versionLock={wo.versionLock}
            canEdit={isPlannerPlus}
          />

          {/* Technical drawing + tolerance */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-zinc-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-800">
                <FileImage className="h-3.5 w-3.5 text-zinc-500" />
                Bản vẽ kỹ thuật
              </div>
              {wo.technicalDrawingUrl ? (
                <a
                  href={wo.technicalDrawingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block max-w-full truncate rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-indigo-700 underline"
                >
                  {wo.technicalDrawingUrl}
                </a>
              ) : (
                <p className="text-xs text-zinc-500">Chưa có bản vẽ.</p>
              )}
            </div>

            <div className="rounded-md border border-zinc-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-800">
                <Ruler className="h-3.5 w-3.5 text-zinc-500" />
                Dung sai / Spec kỹ thuật
              </div>
              {tolerance && Object.keys(tolerance).length > 0 ? (
                <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                  {Object.entries(tolerance).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-start gap-2 rounded bg-zinc-50 px-2 py-1"
                    >
                      <dt className="font-semibold text-zinc-700">{k}:</dt>
                      <dd className="font-mono text-zinc-900">
                        {typeof v === "string" ? v : JSON.stringify(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-xs text-zinc-500">
                  Chưa khai báo dung sai.
                </p>
              )}
            </div>
          </div>

          {/* Estimated/Actual hours summary */}
          {(estimated || actual) && (
            <div className="rounded-md border border-zinc-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-800">
                <Clock className="h-3.5 w-3.5 text-zinc-500" />
                Giờ công
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="text-zinc-500">Ước tính:</span>{" "}
                  <span className="font-mono font-semibold">
                    {estimated !== null ? `${estimated}h` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Thực tế:</span>{" "}
                  <span className="font-mono font-semibold">
                    {actual !== null ? `${actual.toFixed(1)}h` : "—"}
                  </span>
                </div>
                {estimated !== null && actual !== null && (
                  <Badge
                    variant={actual > estimated ? "danger" : "success"}
                    size="sm"
                  >
                    {actual > estimated
                      ? `Vượt ${(actual - estimated).toFixed(1)}h`
                      : `Còn ${(estimated - actual).toFixed(1)}h`}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Source BOM card */}
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
              return (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
                    <Workflow className="h-3.5 w-3.5" />
                    Nguồn BOM (liên kết)
                  </div>
                  <Link
                    href={`/bom/${src.templateId}/grid`}
                    className="inline-flex items-center gap-2 font-mono text-sm font-semibold text-emerald-700 hover:underline"
                  >
                    {src.templateCode}
                  </Link>
                  <span className="ml-2 text-sm text-emerald-800">
                    {src.templateName}
                  </span>
                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-emerald-900 sm:grid-cols-2">
                    <div>
                      Linh kiện:{" "}
                      <span className="font-mono font-semibold">
                        {src.componentSku ?? "—"}
                      </span>{" "}
                      {src.componentName ? `— ${src.componentName}` : ""}
                    </div>
                    {routing.materialCode && (
                      <div>
                        Vật liệu:{" "}
                        <span className="font-mono">
                          {routing.materialCode}
                        </span>
                        {routing.materialName
                          ? ` — ${routing.materialName}`
                          : ""}
                      </div>
                    )}
                  </div>
                  {routing.processRoute && routing.processRoute.length > 0 && (
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
                    <div className="mt-2 rounded border border-emerald-200 bg-white p-2 text-xs text-emerald-900">
                      <span className="font-semibold">Ghi chú kỹ thuật:</span>{" "}
                      {routing.technicalNotes}
                    </div>
                  )}
                </div>
              );
            })()}

          {wo.notes && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs font-semibold text-zinc-500">
                Ghi chú
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
                {wo.notes}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="progress"
          className="overflow-auto px-6 py-4 space-y-4"
        >
          {/* KPI row */}
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
              label="Hoàn thành"
              value={`${progress}%`}
              tone="indigo"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-zinc-800">
              Tiến độ tổng
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm font-mono text-zinc-700">{progress}%</span>
          </div>

          {/* Action buttons */}
          {wo.status !== "COMPLETED" && wo.status !== "CANCELLED" && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 text-xs font-semibold text-zinc-600">
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

          {/* Form báo cáo tiến độ */}
          {canOperate &&
            (wo.status === "IN_PROGRESS" || wo.status === "PAUSED") && (
              <ProgressReportForm
                woId={wo.id}
                lines={wo.lines}
                defaultLineId={defaultLineForReport}
                onSubmitted={() => setDefaultLineForReport(null)}
              />
            )}

          {/* Lines table */}
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800">
              Lines ({wo.lines.length})
            </div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Tên</th>
                  <th className="px-3 py-2 text-right">Required</th>
                  <th className="px-3 py-2 text-right">Completed</th>
                  <th className="px-3 py-2 text-left">Progress</th>
                  {canOperate && <th className="px-3 py-2 text-right" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {wo.lines.map((l) => {
                  const req = Number(l.requiredQty);
                  const done = Number(l.completedQty);
                  const linePct = req > 0 ? Math.round((done / req) * 100) : 0;
                  return (
                    <tr key={l.id}>
                      <td className="px-3 py-2">{l.position}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {l.componentSku}
                      </td>
                      <td className="px-3 py-2">{l.componentName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {req.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {done.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200">
                            <div
                              className="h-full bg-emerald-600"
                              style={{ width: `${linePct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-zinc-500">
                            {linePct}%
                          </span>
                        </div>
                      </td>
                      {canOperate && (
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDefaultLineForReport(l.id);
                              const el = document.getElementById(
                                "progress-report-anchor",
                              );
                              el?.scrollIntoView({ behavior: "smooth" });
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

          <div id="progress-report-anchor" />
          <ProgressTimeline woId={wo.id} />
        </TabsContent>

        <TabsContent value="qc" className="overflow-auto px-6 py-4">
          <QcChecklistEnriched
            woId={wo.id}
            woStatus={wo.status}
            canEdit={canOperate || roles.includes("warehouse")}
            isAdmin={isAdmin}
          />
        </TabsContent>

        <TabsContent
          value="audit"
          className="overflow-auto px-6 py-4 space-y-3"
        >
          <AuditMergedTimeline
            woId={wo.id}
            auditRows={auditQuery.data?.data ?? []}
            progressRows={progressLogQuery.data?.data ?? []}
            isLoading={auditQuery.isLoading || progressLogQuery.isLoading}
            totalAudit={auditQuery.data?.meta.total ?? 0}
          />
        </TabsContent>
      </Tabs>
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
    <>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
          <History className="h-3.5 w-3.5" />
          Lịch sử thao tác (gộp)
          <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono text-zinc-600">
            audit {totalAudit} · progress {progressRows.length}
          </span>
        </h3>
        <Button asChild size="sm" variant="ghost">
          <Link
            href={`/admin/audit?entity=work_order&objectId=${woId}`}
            className="text-xs"
          >
            Xem audit đầy đủ
          </Link>
        </Button>
      </div>

      <div className="flex gap-1">
        {(["all", "audit", "progress"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              filter === f
                ? "bg-indigo-100 text-indigo-800"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
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
        <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-500">
          Chưa có sự kiện nào.
        </div>
      ) : (
        <ol className="space-y-1.5">
          {merged.map((m) =>
            m.kind === "audit" ? (
              <li
                key={`a-${m.row.id}`}
                className="flex items-start gap-3 rounded-md border border-zinc-100 bg-white px-3 py-2 text-xs"
              >
                <span className="inline-flex h-5 shrink-0 items-center rounded bg-indigo-50 px-1.5 font-mono text-[10px] font-semibold uppercase text-indigo-700">
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
                className="flex items-start gap-3 rounded-md border border-emerald-100 bg-emerald-50/30 px-3 py-2 text-xs"
              >
                <span className="inline-flex h-5 shrink-0 items-center rounded bg-emerald-100 px-1.5 font-mono text-[10px] font-semibold uppercase text-emerald-700">
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
                      <span className="ml-2 rounded bg-white px-1.5 font-mono text-[10px] text-zinc-600">
                        {m.row.station}
                      </span>
                    ) : null}
                    {Number(m.row.qtyCompleted) > 0 && (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 font-mono text-[10px] text-emerald-700">
                        +{Number(m.row.qtyCompleted).toLocaleString("vi-VN")} đạt
                      </span>
                    )}
                    {Number(m.row.qtyScrap) > 0 && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 font-mono text-[10px] text-red-700">
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
    </>
  );
}

// ============================================================================
// Helper presentational components
// ============================================================================

function InfoCard({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: string;
  tone?: "zinc" | "emerald" | "red" | "indigo";
}) {
  const toneClass: Record<string, string> = {
    zinc: "border-zinc-200 bg-white text-zinc-900",
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-900",
    red: "border-red-200 bg-red-50/60 text-red-900",
    indigo: "border-indigo-200 bg-indigo-50/60 text-indigo-900",
  };
  return (
    <div className={`rounded-md border p-3 ${toneClass[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

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
    <div className={`rounded-md border p-3 ${toneClasses[tone]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
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
    ? "bg-emerald-500"
    : warning
      ? "bg-amber-500"
      : active
        ? "bg-indigo-500"
        : "bg-zinc-300";
  return (
    <div className="flex items-start gap-3 pb-3">
      <div className="flex flex-col items-center">
        <div className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
        {!last && <div className="mt-1 h-6 w-px bg-zinc-200" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-zinc-700">{label}</span>
          <span className="font-mono text-[11px] text-zinc-400">
            {time ? new Date(time).toLocaleString("vi-VN") : "—"}
          </span>
        </div>
        {note && <div className="mt-0.5 text-[11px] text-amber-700">· {note}</div>}
      </div>
    </div>
  );
}
