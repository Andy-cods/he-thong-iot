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
import { useAddBomLine } from "@/hooks/useBom";
import { ItemPicker, type ItemPickerValue } from "./ItemPicker";
import { cn } from "@/lib/utils";

export interface AddBomLineDialogProps {
  templateId: string;
  parentLineId: string | null;
  parentLabel?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AddBomLineDialog({
  templateId,
  parentLineId,
  parentLabel,
  open,
  onOpenChange,
}: AddBomLineDialogProps) {
  const [component, setComponent] = React.useState<ItemPickerValue | null>(
    null,
  );
  const [qty, setQty] = React.useState<number>(1);
  const [scrap, setScrap] = React.useState<number>(0);
  const [uom, setUom] = React.useState<string>("");

  const addLine = useAddBomLine(templateId);

  React.useEffect(() => {
    if (!open) {
      setComponent(null);
      setQty(1);
      setScrap(0);
      setUom("");
    }
  }, [open]);

  React.useEffect(() => {
    if (component?.uom) setUom(component.uom);
  }, [component]);

  const handleSubmit = async () => {
    if (!component) {
      toast.error("Chưa chọn linh kiện.");
      return;
    }
    if (qty <= 0) {
      toast.error("Số lượng phải > 0.");
      return;
    }
    try {
      await addLine.mutateAsync({
        parentLineId: parentLineId ?? null,
        componentItemId: component.id,
        qtyPerParent: qty,
        scrapPercent: scrap,
        uom: uom || null,
      });
      toast.success(`Đã thêm ${component.sku}.`);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {parentLineId ? "Thêm linh kiện con" : "Thêm linh kiện"}
          </DialogTitle>
          <DialogDescription>
            {parentLabel
              ? `Thêm vào nhánh: ${parentLabel}`
              : "Thêm linh kiện cấp 1 (root) cho BOM"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field>
            <Label htmlFor="add-component" uppercase required>
              Linh kiện
            </Label>
            <ItemPicker
              id="add-component"
              value={component}
              onChange={setComponent}
              placeholder="Tìm SKU hoặc tên..."
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field>
              <Label htmlFor="add-qty" uppercase required>
                Qty
              </Label>
              <Input
                id="add-qty"
                type="number"
                step="0.0001"
                min={0.0001}
                className="tabular-nums"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </Field>
            <Field>
              <Label htmlFor="add-scrap" uppercase>
                Scrap %
              </Label>
              <Input
                id="add-scrap"
                type="number"
                step="0.01"
                min={0}
                max={100}
                className="tabular-nums"
                value={scrap}
                onChange={(e) => setScrap(Number(e.target.value))}
              />
            </Field>
            <Field>
              <Label htmlFor="add-uom" uppercase>
                UoM
              </Label>
              <Input
                id="add-uom"
                placeholder={component?.uom ?? ""}
                value={uom}
                onChange={(e) => setUom(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={addLine.isPending}
          >
            Huỷ
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!component || addLine.isPending}
          >
            {addLine.isPending ? "Đang thêm…" : "Thêm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-1.5", className)}>{children}</div>;
}
