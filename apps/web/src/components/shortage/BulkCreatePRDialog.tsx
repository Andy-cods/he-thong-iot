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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePRFromShortage } from "@/hooks/usePurchaseRequests";

export interface BulkCreatePRDialogProps {
  open: boolean;
  itemIds: string[];
  onOpenChange: (v: boolean) => void;
  onSuccess?: (prId: string) => void;
}

/**
 * BulkCreatePRDialog — tạo 1 PR từ nhiều itemIds (source=SHORTAGE).
 * Backend aggregate remaining_short_qty × 1.1. User chỉ cần nhập title + notes.
 */
export function BulkCreatePRDialog({
  open,
  itemIds,
  onOpenChange,
  onSuccess,
}: BulkCreatePRDialogProps) {
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const create = useCreatePRFromShortage();

  React.useEffect(() => {
    if (open) {
      setTitle(`PR Shortage ${new Date().toLocaleDateString("vi-VN")}`);
      setNotes("");
    }
  }, [open]);

  const handleSubmit = async () => {
    try {
      const res = await create.mutateAsync({
        itemIds,
        title: title.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(`Đã tạo PR ${res.data.code} (${itemIds.length} item)`);
      onOpenChange(false);
      onSuccess?.(res.data.id);
    } catch (err) {
      toast.error(`Tạo PR thất bại: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo PR bulk từ Shortage</DialogTitle>
          <DialogDescription>
            Hệ thống sẽ tạo 1 PR cho {itemIds.length} item đã chọn. Số lượng =
            total_short × 1.1 (buffer 10%). NCC ưu tiên lấy từ item_supplier.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-pr-title" uppercase>
              Tiêu đề
            </Label>
            <Input
              id="bulk-pr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-pr-notes" uppercase>
              Ghi chú
            </Label>
            <Textarea
              id="bulk-pr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={create.isPending || itemIds.length === 0}
          >
            {create.isPending ? "Đang tạo…" : `Tạo PR (${itemIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
