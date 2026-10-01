"use client";

import * as React from "react";
import { AlertTriangle, ArrowRight, Loader2, Merge } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SupplierPicker,
  type SupplierPickerValue,
} from "@/components/procurement/SupplierPicker";
import { findSimilarSupplier } from "@/lib/supplier-dedupe";
import { formatNumber } from "@/lib/format";
import {
  useMergeSupplier,
  useSupplierMergePreview,
  useSuppliersList,
  type SupplierMergeCounts,
} from "@/hooks/useSuppliers";

export interface MergeSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** NCC hiện tại — sẽ bị gộp VÀO NCC khác (is_active=false sau khi gộp xong). */
  source: { id: string; code: string; name: string };
  /** Gộp xong (thành công) → báo cho trang cha điều hướng sang NCC giữ lại. */
  onMerged: (targetId: string) => void;
}

const COUNT_LABELS: Array<{ key: keyof SupplierMergeCounts; label: string }> = [
  { key: "purchaseOrderCount", label: "Đơn mua (PO)" },
  { key: "finInvoiceCount", label: "Hoá đơn" },
  { key: "finPaymentCount", label: "Đợt thanh toán" },
  { key: "finTransactionCount", label: "Giao dịch thu/chi" },
  { key: "itemSupplierCount", label: "Bảng giá vật tư" },
  { key: "prLineCount", label: "Dòng đề xuất vật tư (NCC ưu tiên)" },
  { key: "aliasCount", label: "Bí danh NCC" },
];

/**
 * TASK-6VIEC Việc 3 — "Gộp vào NCC khác" (chỉ admin, xem RBAC `delete:supplier`
 * ở route). 2 bước: (1) chọn NCC GIỮ LẠI — gợi ý NCC tên gần giống bằng
 * `lib/supplier-dedupe.ts` sẵn có; (2) xác nhận sau khi xem số PO/hoá đơn/
 * thanh toán/giao dịch/bảng giá vật tư SẼ CHUYỂN. Không xoá dữ liệu — NCC
 * nguồn chỉ bị đánh dấu ngừng hoạt động (`POST /api/suppliers/[id]/merge`).
 */
export function MergeSupplierDialog({
  open,
  onOpenChange,
  source,
  onMerged,
}: MergeSupplierDialogProps) {
  const [step, setStep] = React.useState<"pick" | "confirm">("pick");
  const [target, setTarget] = React.useState<SupplierPickerValue | null>(null);

  // Gợi ý NCC tên gần giống trong số NCC đang hoạt động (trừ chính nó) —
  // dùng lại hàm THUẦN findSimilarSupplier (không gọi DB riêng, tận dụng
  // danh sách NCC đang hoạt động đã tải).
  const candidatesQuery = useSuppliersList({
    isActive: true,
    pageSize: 100,
    sort: "name",
  });
  const suggestion = React.useMemo(() => {
    const rows = (candidatesQuery.data?.data ?? []).filter(
      (r) => r.id !== source.id,
    );
    return findSimilarSupplier(source.name, rows);
  }, [candidatesQuery.data, source.id, source.name]);

  const preview = useSupplierMergePreview(
    source.id,
    step === "confirm" ? (target?.id ?? null) : null,
  );
  const merge = useMergeSupplier(source.id);

  React.useEffect(() => {
    if (open) {
      setStep("pick");
      setTarget(null);
    }
  }, [open]);

  const handleConfirmMerge = async () => {
    if (!target) return;
    try {
      const res = await merge.mutateAsync(target.id);
      toast.success(
        `Đã gộp ${source.code} vào ${target.code} — chuyển ${formatNumber(
          Object.values(res.data.moved).reduce((a, b) => a + b, 0),
        )} bản ghi.`,
      );
      onOpenChange(false);
      onMerged(target.id);
    } catch (err) {
      toast.error((err as Error).message || "Không gộp được NCC.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Gộp NCC &quot;{source.name}&quot; vào NCC khác</DialogTitle>
          <DialogDescription>
            {step === "pick"
              ? "Chọn NCC sẽ GIỮ LẠI. Mọi PO/hoá đơn/thanh toán/giao dịch/bảng giá của NCC này sẽ chuyển sang NCC đó."
              : `Xác nhận gộp "${source.name}" vào "${target?.name ?? ""}" — không thể hoàn tác.`}
          </DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <div className="space-y-3">
            <SupplierPicker
              value={target}
              onChange={setTarget}
              placeholder="Tìm NCC giữ lại..."
            />
            {suggestion && (!target || target.id !== suggestion.id) ? (
              <button
                type="button"
                onClick={() =>
                  setTarget({
                    id: suggestion.id,
                    code: suggestion.code,
                    name: suggestion.name,
                  })
                }
                className="flex w-full items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[13px] text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
              >
                <span>
                  Gợi ý tên gần giống —{" "}
                  <span className="font-medium">
                    {suggestion.code} — {suggestion.name}
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </button>
            ) : null}
          </div>
        )}

        {step === "confirm" && target ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <strong>
                  {source.code} — {source.name}
                </strong>{" "}
                sẽ ngừng hoạt động. Dữ liệu dưới đây chuyển sang{" "}
                <strong>
                  {target.code} — {target.name}
                </strong>
                . Không xoá dữ liệu, không thể hoàn tác thao tác gộp.
              </span>
            </div>
            {preview.isLoading ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Đang đếm dữ liệu sẽ chuyển…
              </p>
            ) : preview.data ? (
              <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 text-[13px] dark:divide-zinc-800 dark:border-zinc-800">
                {COUNT_LABELS.map(({ key, label }) => (
                  <li
                    key={key}
                    className="flex items-center justify-between px-3 py-1.5"
                  >
                    <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatNumber(preview.data!.data.counts[key])}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-red-600 dark:text-red-400">
                Không tải được dữ liệu xem trước.
              </p>
            )}
          </div>
        ) : null}

        <DialogFooter>
          {step === "pick" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <Button disabled={!target} onClick={() => setStep("confirm")}>
                Tiếp tục
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep("pick")}
                disabled={merge.isPending}
              >
                Quay lại
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleConfirmMerge()}
                disabled={merge.isPending || preview.isLoading || !preview.data}
              >
                {merge.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Merge className="h-3.5 w-3.5" aria-hidden />
                )}
                Xác nhận gộp
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
