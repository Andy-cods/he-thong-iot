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
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
          <p className="text-sm text-zinc-500">
            QC Checks (hardcode 3 checkpoint V1.3 stub) — UI chi tiết sẽ
            có ở Phase B6.
          </p>
        </TabsContent>

        <TabsContent value="audit" className="overflow-auto px-6 py-4">
          <p className="text-sm text-zinc-500">
            Audit log — xem tại <code>/admin/audit?objectType=work_order&amp;objectId={wo.id}</code>
          </p>
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
