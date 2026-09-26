"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * V4.1 TC-08 — Hộp xác nhận cho thao tác huỷ chứng từ tài chính (huỷ giao
 * dịch, huỷ đợt thanh toán, huỷ hoá đơn, ẩn nguồn). Trước đây huỷ bằng 1 click
 * không hỏi lại. Nhẹ hơn `DialogConfirm` (không bắt gõ chữ) vì huỷ = đổi trạng
 * thái VOID có vết kiểm toán, không xoá dữ liệu.
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
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v); }}>
      <DialogContent size="sm" role="alertdialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            {title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-zinc-600 dark:text-zinc-300">{description}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Không
          </Button>
          <Button type="button" variant="danger" onClick={() => void onConfirm()} disabled={loading}>
            {loading ? "Đang xử lý…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
