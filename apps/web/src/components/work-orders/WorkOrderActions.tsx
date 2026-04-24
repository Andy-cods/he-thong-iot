"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, Pause, Play, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCancelWorkOrder,
  useCompleteWorkOrder,
  usePauseWorkOrder,
  useStartWorkOrder,
  type WorkOrderStatus,
} from "@/hooks/useWorkOrders";

/**
 * V1.9-P4 — action buttons pause / resume / complete / cancel.
 *
 * Extracted từ WO detail page; dùng chung cho header + tab Tiến độ.
 */
export function WorkOrderActions({
  woId,
  status,
  versionLock,
  canOperate,
  canComplete,
  canCancel,
  size = "sm",
}: {
  woId: string;
  status: WorkOrderStatus;
  versionLock: number;
  canOperate: boolean;
  canComplete: boolean;
  canCancel: boolean;
  size?: "sm" | "md";
}) {
  const startMut = useStartWorkOrder(woId);
  const pauseMut = usePauseWorkOrder(woId);
  const completeMut = useCompleteWorkOrder(woId);
  const cancelMut = useCancelWorkOrder(woId);

  const onStart = async () => {
    try {
      await startMut.mutateAsync(versionLock);
      toast.success("WO đã bắt đầu chạy.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onPause = async () => {
    const reason = prompt("Lý do tạm dừng (tùy chọn):") ?? "";
    try {
      await pauseMut.mutateAsync({ mode: "pause", reason, versionLock });
      toast.success("Đã tạm dừng.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onResume = async () => {
    try {
      await pauseMut.mutateAsync({ mode: "resume", versionLock });
      toast.success("Đã tiếp tục.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onComplete = async () => {
    if (!confirm("Xác nhận hoàn thành WO? Tất cả line phải đã đủ qty.")) return;
    try {
      await completeMut.mutateAsync(versionLock);
      toast.success("WO đã hoàn thành.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onCancel = async () => {
    const reason = prompt("Nhập lý do hủy:") ?? "";
    if (!reason) return;
    try {
      await cancelMut.mutateAsync({ reason, versionLock });
      toast.success("WO đã bị hủy.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === "DRAFT" || status === "QUEUED") && canOperate && (
        <Button size={size} onClick={onStart} disabled={startMut.isPending}>
          <Play className="h-3.5 w-3.5" />
          Bắt đầu
        </Button>
      )}
      {status === "IN_PROGRESS" && canOperate && (
        <Button
          size={size}
          variant="secondary"
          onClick={onPause}
          disabled={pauseMut.isPending}
        >
          <Pause className="h-3.5 w-3.5" />
          Tạm dừng
        </Button>
      )}
      {status === "PAUSED" && canOperate && (
        <Button size={size} onClick={onResume} disabled={pauseMut.isPending}>
          <RefreshCw className="h-3.5 w-3.5" />
          Tiếp tục
        </Button>
      )}
      {status === "IN_PROGRESS" && canComplete && (
        <Button
          size={size}
          onClick={onComplete}
          disabled={completeMut.isPending}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Hoàn thành
        </Button>
      )}
      {status !== "COMPLETED" && status !== "CANCELLED" && canCancel && (
        <Button
          size={size}
          variant="destructive"
          onClick={onCancel}
          disabled={cancelMut.isPending}
        >
          <XCircle className="h-3.5 w-3.5" />
          Hủy
        </Button>
      )}
    </div>
  );
}
