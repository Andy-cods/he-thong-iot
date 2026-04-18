"use client";

import * as React from "react";
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
  useConvertPRToPOs,
  type ConvertPRResult,
} from "@/hooks/usePurchaseOrders";

export interface ConvertPRDialogProps {
  open: boolean;
  prId: string;
  prCode: string;
  onOpenChange: (v: boolean) => void;
  onSuccess?: (result: ConvertPRResult) => void;
}

/**
 * ConvertPRDialog — confirm convert PR APPROVED → N PO split by supplier.
 * Backend atomic: rollback nếu 1 PO fail. Hiển thị warning irreversible.
 */
export function ConvertPRDialog({
  open,
  prId,
  prCode,
  onOpenChange,
  onSuccess,
}: ConvertPRDialogProps) {
  const convert = useConvertPRToPOs();

  const handleConfirm = async () => {
    try {
      const res = await convert.mutateAsync(prId);
      toast.success(
        `Đã tạo ${res.data.createdPOs.length} PO từ PR ${prCode}`,
      );
      onOpenChange(false);
      onSuccess?.(res.data);
    } catch (err) {
      toast.error(`Convert thất bại: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert PR {prCode} sang PO</DialogTitle>
          <DialogDescription>
            Hệ thống sẽ tạo N PO tương ứng với N nhà cung cấp ưu tiên trong PR.
            Mỗi dòng PR phải có preferred supplier; nếu thiếu, toàn bộ convert
            sẽ rollback. PR sẽ chuyển trạng thái CONVERTED.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Thao tác không thể undo. Snapshot line liên kết sẽ tự chuyển
          PLANNED → PURCHASING.
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={convert.isPending}
          >
            {convert.isPending ? "Đang convert…" : "Xác nhận Convert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
