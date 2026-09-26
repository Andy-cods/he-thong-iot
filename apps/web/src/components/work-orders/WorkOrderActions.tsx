"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  XCircle,
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
import {
  useCancelWorkOrder,
  useCompleteWorkOrder,
  useDeleteWorkOrder,
  usePauseWorkOrder,
  useStartWorkOrder,
  type WorkOrderStatus,
} from "@/hooks/useWorkOrders";
import { qk } from "@/lib/query-keys";
import { isWoDeletable } from "@/lib/wo-guards";

/**
 * V1.9-P4 — action buttons pause / resume / complete / cancel.
 *
 * Extracted từ WO detail page; dùng chung cho header + tab Tiến độ.
 */
export function WorkOrderActions({
  woId,
  woNo,
  status,
  versionLock,
  canOperate,
  canComplete,
  canCancel,
  /** V3.7.46 — Chỉ operator/admin mới approve/reject YCSX (planner = creator). */
  canApprove = false,
  /** V3.7.71 — Admin xoá vĩnh viễn LSX (DRAFT/CANCELLED only). */
  canDelete = false,
  size = "sm",
}: {
  woId: string;
  woNo?: string;
  status: WorkOrderStatus;
  versionLock: number;
  canOperate: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canApprove?: boolean;
  canDelete?: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const startMut = useStartWorkOrder(woId);
  const pauseMut = usePauseWorkOrder(woId);
  const completeMut = useCompleteWorkOrder(woId);
  const cancelMut = useCancelWorkOrder(woId);
  const deleteMut = useDeleteWorkOrder(woId);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState("");

  // V3.7.46 — Approve/Reject Yêu cầu sản xuất (DRAFT only)
  const qc = useQueryClient();
  const approveMut = useMutation({
    mutationFn: async (notes?: string) => {
      const res = await fetch(`/api/work-orders/${woId}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: notes || null }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error?.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    // V4.1 SX-09 — key đúng `qk.workOrders` (trước đây ["work-orders"] /
    // ["wo-detail"] không khớp → trang không cập nhật, bấm lần 2 ra 409).
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.all });
      qc.invalidateQueries({ queryKey: qk.workOrders.detail(woId) });
    },
  });
  const rejectMut = useMutation({
    mutationFn: async (reason: string) => {
      const res = await fetch(`/api/work-orders/${woId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error?.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    // V4.1 SX-09 — key đúng `qk.workOrders` (trước đây ["work-orders"] /
    // ["wo-detail"] không khớp → trang không cập nhật, bấm lần 2 ra 409).
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.all });
      qc.invalidateQueries({ queryKey: qk.workOrders.detail(woId) });
    },
  });

  const onApprove = async () => {
    const notes = prompt("Ghi chú khi duyệt (tuỳ chọn):") ?? "";
    try {
      await approveMut.mutateAsync(notes || undefined);
      toast.success("Đã duyệt yêu cầu — chuyển thành Lệnh sản xuất chính thức.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onReject = async () => {
    const reason = prompt("Lý do từ chối (bắt buộc, tối thiểu 5 ký tự):") ?? "";
    if (reason.trim().length < 5) {
      toast.error("Lý do tối thiểu 5 ký tự.");
      return;
    }
    try {
      await rejectMut.mutateAsync(reason.trim());
      toast.success("Đã từ chối yêu cầu sản xuất.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

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
    // TODO V4.1 Q2: bước "Nhập kho thành phẩm" (SL đạt → PROD_IN) đang TẠM ẨN
    // theo quyết định anh Thang — hoàn thành hiện chỉ chuyển trạng thái.
    if (
      !confirm(
        "Xác nhận hoàn thành lệnh? Cần đã báo sản lượng đạt > 0 (và đủ các dòng linh kiện nếu có).",
      )
    )
      return;
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
      {/* V3.7.46 — DRAFT = Yêu cầu SX. CHỈ operator/admin (canApprove)
          mới hiện 2 nút Duyệt/Từ chối. Planner thấy badge "Chờ Gia công duyệt". */}
      {status === "DRAFT" && canApprove && (
        <>
          <Button
            size={size}
            onClick={onApprove}
            disabled={approveMut.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            Duyệt YCSX
          </Button>
          <Button
            size={size}
            variant="outline"
            onClick={onReject}
            disabled={rejectMut.isPending}
            className="border-red-300 text-red-700 hover:bg-red-50"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            Từ chối
          </Button>
        </>
      )}
      {status === "DRAFT" && !canApprove && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
          ⏳ Chờ Bộ phận Gia công duyệt
        </span>
      )}
      {/* QUEUED → start (legacy flow). Sau V3.7.46 không tạo QUEUED nữa.
          DRAFT giờ phải approve trước → RELEASED → start. */}
      {(status === "RELEASED" || status === "QUEUED") && canOperate && (
        <Button size={size} onClick={onStart} disabled={startMut.isPending}>
          <Play className="h-3.5 w-3.5" />
          Bắt đầu sản xuất
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
      {/* V3.7.71 — Xoá vĩnh viễn (admin only).
          V4.1 SX-07 — chỉ hiện với lệnh Nháp/Đã huỷ (server cũng chặn; force
          chỉ còn nghĩa bỏ link reservation/assembly sót lại). */}
      {canDelete && isWoDeletable(status) && (
        <Button
          size={size}
          variant="outline"
          onClick={() => {
            setDeleteConfirm("");
            setDeleteOpen(true);
          }}
          disabled={deleteMut.isPending}
          className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Xoá
        </Button>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá Lệnh sản xuất — không thể hoàn tác</DialogTitle>
            <DialogDescription>
              Hành động này xoá vĩnh viễn lệnh{" "}
              <strong className="font-mono">{woNo ?? woId.slice(0, 8)}</strong>{" "}
              + toàn bộ routing/material/tool/QC lines. Giữ chỗ vật tư còn lại
              (nếu có) sẽ được nhả trước khi xoá.
              <br />
              <span className="mt-2 block text-red-700 dark:text-red-400">
                Chỉ xoá được lệnh Nháp / Đã huỷ. Cân nhắc dùng "Huỷ" thay vì
                "Xoá" để giữ vết.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="wo-del-confirm" required>
              Nhập "XOA" để xác nhận
            </Label>
            <input
              id="wo-del-confirm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              autoComplete="off"
              autoFocus
              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm font-mono uppercase outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm.trim() !== "XOA" || deleteMut.isPending}
              onClick={() => {
                deleteMut.mutate(
                  { force: true },
                  {
                    onSuccess: () => {
                      toast.success(`Đã xoá lệnh ${woNo ?? ""}`.trim());
                      setDeleteOpen(false);
                      router.push("/work-orders");
                    },
                    onError: (e) =>
                      toast.error(`Lỗi: ${(e as Error).message}`),
                  },
                );
              }}
            >
              {deleteMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Xoá vĩnh viễn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
