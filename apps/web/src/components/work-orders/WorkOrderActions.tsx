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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm, usePrompt } from "@/components/ui/confirm-dialog";
import { BinSuggestCombobox, type BinOption } from "@/components/warehouse/BinSuggestCombobox";
import {
  useCancelWorkOrder,
  useCompleteWorkOrder,
  useDeleteWorkOrder,
  usePauseWorkOrder,
  useStartWorkOrder,
  type WorkOrderStatus,
} from "@/hooks/useWorkOrders";
import { HIDDEN_FEATURES } from "@/lib/hidden-features";
import { qk } from "@/lib/query-keys";
import {
  WO_COMPLETE_REASON_MIN_LENGTH,
  getWoCompleteShortfall,
  isWoDeletable,
} from "@/lib/wo-guards";
import { statusLabel } from "@/lib/status";

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
  /** V4.2 PROD-01 — SL đạt/kế hoạch để phát hiện hoàn thành thiếu sản lượng. */
  goodQty,
  plannedQty,
  /** V4.3 Q2 — item thành phẩm, cần để gợi ý vị trí + tạo lô FG khi hoàn thành. */
  productItemId,
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
  goodQty?: string | number | null;
  plannedQty?: string | number | null;
  productItemId?: string | null;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  // V4.1 UX-01: hộp xác nhận/nhập lý do dùng chung thay hộp thoại gốc trình duyệt.
  const askConfirm = useConfirm();
  const askText = usePrompt();
  const startMut = useStartWorkOrder(woId);
  const pauseMut = usePauseWorkOrder(woId);
  const completeMut = useCompleteWorkOrder(woId);
  const cancelMut = useCancelWorkOrder(woId);
  const deleteMut = useDeleteWorkOrder(woId);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState("");

  // V4.3 Q2 — dialog hoàn thành có ô SL thành phẩm + chọn vị trí (nhập kho
  // thành phẩm). Thay hộp thoại prompt đơn giản cũ khi fgReceipt đã bật lại.
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [completeReasonInput, setCompleteReasonInput] = React.useState("");
  const [fgQtyInput, setFgQtyInput] = React.useState("");
  const [fgBinId, setFgBinId] = React.useState("");
  const [fgHoldQc, setFgHoldQc] = React.useState(false);
  const [bins, setBins] = React.useState<BinOption[]>([]);
  React.useEffect(() => {
    if (!completeOpen || HIDDEN_FEATURES.fgReceipt) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/warehouse/layout");
        const json = (await res.json()) as {
          data?: { bins?: BinOption[] };
        };
        if (!cancelled) setBins((json.data?.bins ?? []).filter((b) => b.isActive));
      } catch {
        // ignore — combobox vẫn dùng được (nhóm "Chọn khác" trống, gõ tìm không ra)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [completeOpen]);

  // V4.3 Q2 — mặc định vị trí lưu = gợi ý #1 (chỉ tự điền khi còn để trống,
  // không ghi đè lựa chọn tay của người dùng).
  React.useEffect(() => {
    const qtyNum = Number(fgQtyInput);
    if (
      !completeOpen ||
      HIDDEN_FEATURES.fgReceipt ||
      fgBinId ||
      !productItemId ||
      !Number.isFinite(qtyNum) ||
      qtyNum <= 0
    ) {
      return;
    }
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `/api/warehouse/putaway-suggestion?itemId=${encodeURIComponent(productItemId)}&qty=${qtyNum}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { data?: Array<{ binId: string }> };
        const top = json.data?.[0]?.binId;
        if (top) setFgBinId((cur) => cur || top);
      } catch {
        // ignore — người dùng vẫn tự chọn được qua combobox
      }
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completeOpen, fgQtyInput, productItemId]);

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
    const notes = await askText({
      title: "Duyệt yêu cầu sản xuất",
      label: "Ghi chú khi duyệt (tuỳ chọn)",
      confirmLabel: "Duyệt",
    });
    if (notes === null) return;
    try {
      await approveMut.mutateAsync(notes || undefined);
      toast.success("Đã duyệt yêu cầu — chuyển thành Lệnh sản xuất chính thức.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onReject = async () => {
    const reason = await askText({
      title: "Từ chối yêu cầu sản xuất",
      label: "Lý do từ chối",
      minLength: 5,
      tone: "danger",
      confirmLabel: "Từ chối",
    });
    if (reason === null) return;
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
      toast.success("Lệnh SX đã bắt đầu chạy.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onPause = async () => {
    const reason = await askText({
      title: "Tạm dừng lệnh sản xuất",
      label: "Lý do tạm dừng (tuỳ chọn)",
      confirmLabel: "Tạm dừng",
    });
    if (reason === null) return;
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

  const shortfall = getWoCompleteShortfall({ goodQty, plannedQty });

  const onComplete = async () => {
    // V4.3 Q2 — fgReceipt đã bật lại: mở dialog có ô SL thành phẩm + chọn vị
    // trí (thay vì prompt đơn giản cũ). Giữ nguyên yêu cầu lý do khi thiếu
    // sản lượng (V4.2 PROD-01) — hiện ngay trong CÙNG dialog, không tách 2 bước.
    if (!HIDDEN_FEATURES.fgReceipt) {
      setCompleteReasonInput("");
      setFgQtyInput(String(Number(goodQty ?? 0) || 0));
      setFgBinId("");
      setFgHoldQc(false);
      setCompleteOpen(true);
      return;
    }
    // Fallback (cờ fgReceipt bật lại true) — flow prompt/confirm cũ.
    let completeReason: string | undefined;
    if (shortfall) {
      const reason = await askText({
        title: "Hoàn thành thiếu sản lượng?",
        description: `Đạt ${shortfall.good} / kế hoạch ${shortfall.planned} — hoàn thành thiếu ${shortfall.missing}. Nhập lý do để xác nhận hoàn thành sớm/thiếu.`,
        label: "Lý do hoàn thành thiếu sản lượng",
        minLength: WO_COMPLETE_REASON_MIN_LENGTH,
        tone: "danger",
        confirmLabel: "Hoàn thành (thiếu SL)",
      });
      if (reason === null) return;
      completeReason = reason.trim();
    } else {
      const ok = await askConfirm({
        title: "Hoàn thành lệnh sản xuất?",
        description: "Cần đã báo sản lượng đạt > 0 (và đủ các dòng linh kiện nếu có).",
        confirmLabel: "Hoàn thành",
      });
      if (!ok) return;
    }
    try {
      await completeMut.mutateAsync({ versionLock, completeReason });
      toast.success("Lệnh SX đã hoàn thành.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const fgQtyNum = Number(fgQtyInput);
  const completeReasonTrimmed = completeReasonInput.trim();
  const completeReasonInvalid =
    !!shortfall && completeReasonTrimmed.length < WO_COMPLETE_REASON_MIN_LENGTH;
  const fgQtyInvalid = !Number.isFinite(fgQtyNum) || fgQtyNum < 0;

  const submitComplete = async () => {
    if (completeReasonInvalid || fgQtyInvalid) return;
    try {
      await completeMut.mutateAsync({
        versionLock,
        completeReason: shortfall ? completeReasonTrimmed : undefined,
        fgQty: fgQtyNum > 0 ? fgQtyNum : undefined,
        fgBinId: fgBinId || null,
        fgHoldQc,
      });
      toast.success(
        fgQtyNum > 0
          ? `Lệnh SX đã hoàn thành — đã nhập kho ${fgQtyNum} thành phẩm.`
          : "Lệnh SX đã hoàn thành.",
      );
      setCompleteOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onCancel = async () => {
    const reason = await askText({
      title: "Huỷ lệnh sản xuất",
      label: "Lý do huỷ",
      required: true,
      tone: "danger",
      confirmLabel: "Huỷ lệnh",
      cancelLabel: "Đóng",
    });
    if (!reason) return;
    try {
      await cancelMut.mutateAsync({ reason, versionLock });
      toast.success("Lệnh SX đã bị huỷ.");
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
      {/* V4.3 fix LOOP_E2E vướng #3 — operator có canOperate (báo tiến độ) nhưng
          KHÔNG canComplete (chỉ admin/planner — xem work-orders/[id]/page.tsx
          `canComplete = isAdmin || planner`). Trước đây nút biến mất không
          giải thích gì → dễ thắc mắc "làm xong sao không hoàn thành được". */}
      {status === "IN_PROGRESS" && canOperate && !canComplete && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700">
          Kế hoạch/Giám đốc hoàn thành lệnh — bạn báo tiến độ ở tab Tiến độ
        </span>
      )}
      {status !== "COMPLETED" && status !== "CANCELLED" && canCancel && (
        <Button
          size={size}
          variant="destructive"
          onClick={onCancel}
          disabled={cancelMut.isPending}
        >
          <XCircle className="h-3.5 w-3.5" />
          Huỷ lệnh
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
              cùng toàn bộ các dòng quy trình / vật tư / dao cụ / QC. Giữ chỗ vật tư còn lại
              (nếu có) sẽ được nhả trước khi xoá.
              <br />
              <span className="mt-2 block text-red-700 dark:text-red-400">
                {/* V4.1 UI-27: nhãn trạng thái từ lib/status.ts (DRAFT = "Chờ duyệt"). */}
                Chỉ xoá được lệnh {statusLabel("wo", "DRAFT")} / {statusLabel("wo", "CANCELLED")}. Cân nhắc dùng "Huỷ" thay vì
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

      {/* V4.3 Q2 — Dialog hoàn thành: SL thành phẩm + vị trí lưu (nhập kho
          thành phẩm) + lý do hoàn thành thiếu sản lượng (V4.2, nếu có). */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hoàn thành lệnh sản xuất?</DialogTitle>
            <DialogDescription>
              {shortfall
                ? `Đạt ${shortfall.good} / kế hoạch ${shortfall.planned} — hoàn thành thiếu ${shortfall.missing}. Nhập lý do để xác nhận hoàn thành sớm/thiếu.`
                : "Cần đã báo sản lượng đạt > 0 (và đủ các dòng linh kiện nếu có)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {shortfall ? (
              <div className="space-y-1">
                <Label htmlFor="wo-complete-reason" required>
                  Lý do hoàn thành thiếu sản lượng
                </Label>
                <Textarea
                  id="wo-complete-reason"
                  value={completeReasonInput}
                  onChange={(e) => setCompleteReasonInput(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="VD: khách cần gấp, phần còn lại làm đợt sau…"
                />
                {completeReasonInvalid && completeReasonTrimmed.length > 0 ? (
                  <p className="text-xs text-red-600">
                    Lý do tối thiểu {WO_COMPLETE_REASON_MIN_LENGTH} ký tự.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="wo-fg-qty">Số lượng thành phẩm nhập kho</Label>
              <Input
                id="wo-fg-qty"
                type="number"
                min={0}
                step="any"
                value={fgQtyInput}
                onChange={(e) => setFgQtyInput(e.target.value)}
                className="tabular-nums"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Mặc định = SL đạt đã báo cáo. Để 0 nếu KHÔNG muốn nhập kho ngay
                (ghi nhận sau).
              </p>
            </div>

            {fgQtyNum > 0 ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="wo-fg-bin">Vị trí lưu</Label>
                  <BinSuggestCombobox
                    itemId={productItemId ?? undefined}
                    qty={fgQtyNum}
                    bins={bins}
                    value={fgBinId}
                    onChange={setFgBinId}
                    hintWhenEmpty="Sẽ vào vị trí gợi ý / Chờ xếp kệ"
                    aria-label="Vị trí lưu thành phẩm"
                    className="w-full"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <Checkbox
                    checked={fgHoldQc}
                    onCheckedChange={(v) => setFgHoldQc(v === true)}
                  />
                  Chờ QC thành phẩm (giữ lô, chưa xuất được cho tới khi QC đạt)
                </label>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteOpen(false)}>
              Huỷ
            </Button>
            <Button
              onClick={submitComplete}
              disabled={completeMut.isPending || completeReasonInvalid || fgQtyInvalid}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {completeMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Hoàn thành
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
