"use client";

import * as React from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * V4.1 TC-08 — Hộp xác nhận cho thao tác huỷ chứng từ tài chính (huỷ giao
 * dịch, huỷ đợt thanh toán, huỷ hoá đơn, ẩn nguồn). Trước đây huỷ bằng 1 click
 * không hỏi lại. Nhẹ hơn `DialogConfirm` (không bắt gõ chữ) vì huỷ = đổi trạng
 * thái VOID có vết kiểm toán, không xoá dữ liệu.
 *
 * V4.1 UX-01 (Đợt 6B): nay là wrapper mỏng của `ui/confirm-dialog` (giữ API cũ
 * để không đụng code tài chính): tông "danger", nút huỷ ghi "Không".
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Xác nhận huỷ",
  loading = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel="Không"
      tone="danger"
      loading={loading}
      onConfirm={onConfirm}
    />
  );
}
