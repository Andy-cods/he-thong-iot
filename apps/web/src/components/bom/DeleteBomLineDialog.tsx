"use client";

import { toast } from "sonner";
import { DialogConfirm } from "@/components/ui/dialog";
import { useDeleteBomLine } from "@/hooks/useBom";

export interface DeleteBomLineDialogProps {
  templateId: string;
  lineId: string | null;
  descendantCount: number;
  label: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Dialog xoá 1 linh kiện (Q4=a): cascade=true mặc định (xoá kèm con).
 * DialogConfirm type-to-confirm "XOA".
 */
export function DeleteBomLineDialog({
  templateId,
  lineId,
  descendantCount,
  label,
  open,
  onOpenChange,
}: DeleteBomLineDialogProps) {
  const deleteLine = useDeleteBomLine(templateId);

  const hasChildren = descendantCount > 0;
  const description = hasChildren
    ? `Linh kiện "${label}" có ${descendantCount} cấp con. Xoá sẽ cascade xoá toàn bộ nhánh. Hành động không hoàn tác. Gõ "XOA" để xác nhận.`
    : `Xoá linh kiện "${label}". Gõ "XOA" để xác nhận.`;

  const handleConfirm = async () => {
    if (!lineId) return;
    try {
      await deleteLine.mutateAsync({ lineId, cascade: hasChildren });
      toast.success(
        hasChildren
          ? `Đã xoá ${descendantCount + 1} linh kiện (cascade).`
          : "Đã xoá linh kiện.",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <DialogConfirm
      open={open}
      onOpenChange={onOpenChange}
      title={hasChildren ? `Xoá nhánh ${descendantCount + 1} linh kiện?` : "Xoá linh kiện?"}
      description={description}
      confirmText="XOA"
      actionLabel="Xoá"
      loading={deleteLine.isPending}
      onConfirm={() => void handleConfirm()}
    />
  );
}
