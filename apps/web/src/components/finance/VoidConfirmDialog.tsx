"use client";

import * as React from "react";
import { toast } from "sonner";
import { DialogConfirm } from "@/components/ui/dialog";
import { fmtVND } from "@/components/finance/_format";

export interface VoidTarget {
  id: string;
  code: string;
  amount: number | string;
}

/**
 * Xác nhận trước khi HUỶ chứng từ tiền (giao dịch thu/chi, thanh toán).
 * Huỷ làm thay đổi số dư tài khoản + công nợ nên bắt gõ "HUY" — trước đây
 * chỉ 1 click là huỷ ngay, không hỏi lại, lỗi cũng bị nuốt im lặng.
 */
export function VoidConfirmDialog({
  target,
  kind,
  onClose,
  onConfirm,
}: {
  target: VoidTarget | null;
  kind: "giao dịch" | "thanh toán" | "hoá đơn";
  onClose: () => void;
  onConfirm: (id: string) => Promise<unknown>;
}) {
  const [loading, setLoading] = React.useState(false);
  return (
    <DialogConfirm
      open={target !== null}
      onOpenChange={(o) => {
        if (!o && !loading) onClose();
      }}
      title={`Huỷ ${kind} ${target?.code ?? ""}`.trim()}
      description={
        target
          ? `Số tiền ${fmtVND(target.amount)}. ${
              kind === "hoá đơn"
                ? "Hoá đơn sẽ bị loại khỏi công nợ"
                : "Huỷ sẽ hoàn lại số dư tài khoản và công nợ liên quan"
            }; thao tác không thể hoàn tác.`
          : undefined
      }
      confirmText="HUY"
      actionLabel={`Huỷ ${kind}`}
      loading={loading}
      onConfirm={async () => {
        if (!target) return;
        setLoading(true);
        try {
          await onConfirm(target.id);
          toast.success(`Đã huỷ ${kind} ${target.code}`);
          onClose();
        } catch (e) {
          toast.error(
            `Huỷ ${kind} thất bại: ${e instanceof Error ? e.message : "lỗi không xác định"}`,
          );
        } finally {
          setLoading(false);
        }
      }}
    />
  );
}
