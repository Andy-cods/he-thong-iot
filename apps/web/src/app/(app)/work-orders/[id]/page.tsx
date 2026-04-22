"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Factory,
  Pause,
  Play,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Smartphone,
  CalendarClock,
  Workflow,
  History,
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
import { QcChecklist } from "@/components/qc/QcChecklist";
import { useSession } from "@/hooks/useSession";
import {
  useWorkOrderDetail,
  useStartWorkOrder,
  usePauseWorkOrder,
  useCompleteWorkOrder,
  useCancelWorkOrder,
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
  const startMut = useStartWorkOrder(id);
  const pauseMut = usePauseWorkOrder(id);
  const completeMut = useCompleteWorkOrder(id);
  const cancelMut = useCancelWorkOrder(id);

  const wo = query.data?.data;

  // V1.7-beta.2.6 — Source BOM lookup (bidirectional link).
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

  // V1.7-beta.2.6 — Audit trail for this WO.
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
      const params = new URLSearchParams({
        entity: "work_order",
        objectId: id,
        pageSize: "50",
      });
      const res = await fetch(`/api/admin/audit?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Không tải được audit log");
      return res.json();
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  const roles = session.data?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const canRunStart =
    roles.includes("admin") ||
    roles.includes("planner") ||
    roles.includes("operator");
  const canComplete = roles.includes("admin") || roles.includes("planner");

  const onStart = async () => {
    try {
      await startMut.mutateAsync(wo?.versionLock);
      toast.success("WO đã bắt đầu chạy.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const onPauseToggle = async () => {
    const mode = wo?.status === "PAUSED" ? "resume" : "pause";
    try {
      await pauseMut.mutateAsync({ mode, versionLock: wo?.versionLock });
      toast.success(mode === "pause" ? "Đã tạm dừng." : "Đã tiếp tục.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const onComplete = async () => {
    if (!confirm("Xác nhận hoàn thành WO? Tất cả line phải đã hoàn tất.")) return;
    try {
      await completeMut.mutateAsync(wo?.versionLock);
      toast.success("WO đã hoàn thành.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const onCancel = async () => {
    const reason = prompt("Nhập lý do hủy:") || "";
    if (!reason) return;
    try {
      await cancelMut.mutateAsync({ reason, versionLock: wo?.versionLock });
      toast.success("WO đã bị hủy.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

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
              <span>Priority: {wo.priority}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {wo.status === "DRAFT" || wo.status === "QUEUED" ? (
            canRunStart && (
              <Button size="sm" onClick={onStart} disabled={startMut.isPending}>
                <Play className="h-3.5 w-3.5" />
                Bắt đầu
              </Button>
            )
          ) : null}
          {wo.status === "IN_PROGRESS" && canRunStart && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onPauseToggle}
              disabled={pauseMut.isPending}
            >
              <Pause className="h-3.5 w-3.5" />
              Tạm dừng
            </Button>
          )}
          {wo.status === "PAUSED" && canRunStart && (
            <Button
              size="sm"
              onClick={onPauseToggle}
              disabled={pauseMut.isPending}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tiếp tục
            </Button>
          )}
          {wo.status === "IN_PROGRESS" && (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/pwa/assembly/${wo.id}`}>
                <Smartphone className="h-3.5 w-3.5" />
                Mở PWA scan
              </Link>
            </Button>
          )}
          {wo.status === "IN_PROGRESS" && canComplete && (
            <Button
              size="sm"
              onClick={onComplete}
              disabled={completeMut.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Hoàn thành
            </Button>
          )}
          {wo.status !== "COMPLETED" && wo.status !== "CANCELLED" && isAdmin && (
            <Button
              size="sm"
              variant="destructive"
              onClick={onCancel}
              disabled={cancelMut.isPending}
            >
              <XCircle className="h-3.5 w-3.5" />
              Hủy
            </Button>
          )}
        </div>
      </header>

      <Tabs defaultValue="info" className="flex-1 overflow-hidden">
        <TabsList className="mx-6 mt-3">
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="progress">Tiến độ</TabsTrigger>
          <TabsTrigger value="qc">QC Checks</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="overflow-auto px-6 py-4">
          {/* ID row + copy */}
          <div className="mb-4 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              ID
            </span>
            <code className="flex-1 font-mono text-xs text-zinc-700">{wo.id}</code>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoCard label="Planned Qty" value={Number(wo.plannedQty).toLocaleString("vi-VN")} />
            <InfoCard
              label="Good / Scrap"
              value={`${Number(wo.goodQty).toLocaleString("vi-VN")} / ${Number(wo.scrapQty).toLocaleString("vi-VN")}`}
            />
            <InfoCard
              label="Bắt đầu"
              value={wo.startedAt ? new Date(wo.startedAt).toLocaleString("vi-VN") : "—"}
            />
            <InfoCard
              label="Hoàn thành"
              value={wo.completedAt ? new Date(wo.completedAt).toLocaleString("vi-VN") : "—"}
            />
            <InfoCard label="Planned start" value={wo.plannedStart ?? "—"} />
            <InfoCard label="Planned end" value={wo.plannedEnd ?? "—"} />
          </div>

          {/* Timeline */}
          <div className="mt-4 rounded-md border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-zinc-600">
              <CalendarClock className="h-3.5 w-3.5" />
              Trục thời gian
            </div>
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

          {/* Nguồn BOM card (V1.7-beta.2.6) */}
          {sourceBomQuery.data?.data && (() => {
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
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/50 p-4">
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
                      <span className="font-mono">{routing.materialCode}</span>
                      {routing.materialName ? ` — ${routing.materialName}` : ""}
                    </div>
                  )}
                  {routing.blankSize && (
                    <div>
                      Phôi: <span className="font-mono">{routing.blankSize}</span>
                    </div>
                  )}
                  {routing.estimatedHours !== undefined && (
                    <div>
                      Ước tính:{" "}
                      <span className="font-mono">{routing.estimatedHours}</span>{" "}
                      giờ
                    </div>
                  )}
                </div>
                {routing.processRoute && routing.processRoute.length > 0 && (
                  <div className="mt-2 text-xs">
                    <span className="mr-1 font-semibold text-emerald-800">
                      Quy trình:
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
            <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs font-semibold text-zinc-500">Ghi chú</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
                {wo.notes}
              </div>
            </div>
          )}
          {wo.pausedReason && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-semibold text-amber-700">
                Lý do tạm dừng
              </div>
              <div className="mt-1 text-sm text-amber-900">
                {wo.pausedReason}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="progress" className="overflow-auto px-6 py-4">
          {/* KPI row */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              label="Tổng line"
              value={String(wo.lines.length)}
              tone="indigo"
            />
          </div>
          <div className="mb-4 flex items-center gap-3">
            <div className="text-sm font-semibold text-zinc-800">
              Tiến độ tổng: {progress}%
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Tên</th>
                  <th className="px-3 py-2 text-right">Required</th>
                  <th className="px-3 py-2 text-right">Completed</th>
                  <th className="px-3 py-2 text-left">Snapshot state</th>
                  <th className="px-3 py-2 text-left">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {wo.lines.map((l) => {
                  const req = Number(l.requiredQty);
                  const done = Number(l.completedQty);
                  const linePct =
                    req > 0 ? Math.round((done / req) * 100) : 0;
                  return (
                    <tr key={l.id}>
                      <td className="px-3 py-2">{l.position}</td>
                      <td className="px-3 py-2 font-mono">{l.componentSku}</td>
                      <td className="px-3 py-2">{l.componentName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {req.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {done.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">
                          {l.snapshotState}
                        </Badge>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="qc" className="overflow-auto px-6 py-4">
          <QcChecklist
            woId={wo.id}
            woStatus={wo.status}
            canEdit={
              roles.includes("admin") ||
              roles.includes("planner") ||
              roles.includes("operator") ||
              roles.includes("warehouse")
            }
            isAdmin={isAdmin}
          />
        </TabsContent>

        <TabsContent value="audit" className="overflow-auto px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
              <History className="h-3.5 w-3.5" />
              Lịch sử thao tác
              <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono text-zinc-600">
                {auditQuery.data?.meta.total ?? 0}
              </span>
            </h3>
            <Button asChild size="sm" variant="ghost">
              <Link
                href={`/admin/audit?entity=work_order&objectId=${wo.id}`}
                className="text-xs"
              >
                Mở trang Audit đầy đủ
              </Link>
            </Button>
          </div>
          {auditQuery.isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (auditQuery.data?.data ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-500">
              Chưa có sự kiện audit nào cho WO này.
            </div>
          ) : (
            <ol className="space-y-1.5">
              {(auditQuery.data?.data ?? []).map((e) => (
                <li
                  key={e.id}
                  className="flex items-start gap-3 rounded-md border border-zinc-100 bg-white px-3 py-2 text-xs"
                >
                  <span className="inline-flex h-5 shrink-0 items-center rounded bg-indigo-50 px-1.5 font-mono text-[10px] font-semibold uppercase text-indigo-700">
                    {e.action}
                  </span>
                  <div className="flex-1">
                    <div className="text-zinc-800">
                      <span className="font-semibold">
                        {e.actorDisplayName ?? e.actorUsername ?? "Hệ thống"}
                      </span>
                      {e.notes ? (
                        <span className="ml-1 text-zinc-600">· {e.notes}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-400">
                      {new Date(e.occurredAt).toLocaleString("vi-VN")}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="text-xs font-semibold text-zinc-500">{label}</div>
      <div className="mt-1 text-sm tabular-nums text-zinc-900">{value}</div>
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
        {note && (
          <div className="mt-0.5 text-[11px] text-amber-700">· {note}</div>
        )}
      </div>
    </div>
  );
}
