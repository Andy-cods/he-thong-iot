"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ORDER_PRIORITIES,
  ORDER_PRIORITY_LABELS,
  type OrderPriority,
} from "@iot/shared";
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
import { ItemPicker, type ItemPickerValue } from "@/components/bom/ItemPicker";
import { useCreateOrder } from "@/hooks/useOrders";

/**
 * V2.0 P2 W6 — TASK-20260427-015.
 *
 * Inline dialog tạo đơn hàng từ BOM workspace. Prefill `bomTemplateId` từ
 * context (BOM detail) để user chỉ cần nhập customer + qty + sản phẩm.
 *
 * KHÔNG redirect sau submit — chỉ toast + invalidate query (parent panel
 * tự refresh list). User muốn xem chi tiết đơn → click row trong panel.
 */

export interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bomTemplateId: string;
  bomTemplateCode: string;
  /** Optional pre-fill product item (vd. parent item của BOM). */
  defaultProductItem?: ItemPickerValue | null;
}

export function CreateOrderDialog({
  open,
  onOpenChange,
  bomTemplateId,
  bomTemplateCode,
  defaultProductItem = null,
}: CreateOrderDialogProps) {
  const createOrder = useCreateOrder();

  const [customerName, setCustomerName] = React.useState("");
  const [customerRef, setCustomerRef] = React.useState("");
  const [productItem, setProductItem] =
    React.useState<ItemPickerValue | null>(defaultProductItem);
  const [orderQty, setOrderQty] = React.useState<string>("1");
  const [dueDate, setDueDate] = React.useState<string>("");
  const [priority, setPriority] = React.useState<OrderPriority>("NORMAL");
  const [notes, setNotes] = React.useState<string>("");
  const [errors, setErrors] = React.useState<{
    customerName?: string;
    productItemId?: string;
    orderQty?: string;
  }>({});

  React.useEffect(() => {
    if (open) {
      setCustomerName("");
      setCustomerRef("");
      setProductItem(defaultProductItem ?? null);
      setOrderQty("1");
      setDueDate("");
      setPriority("NORMAL");
      setNotes(`Tạo từ BOM ${bomTemplateCode}`);
      setErrors({});
    }
  }, [open, defaultProductItem, bomTemplateCode]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (customerName.trim().length < 2) {
      next.customerName = "Tối thiểu 2 ký tự";
    }
    if (!productItem?.id) {
      next.productItemId = "Cần chọn sản phẩm";
    }
    const qtyNum = Number(orderQty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      next.orderQty = "Số lượng phải > 0";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      const dueDateValue = dueDate ? new Date(dueDate) : null;
      await createOrder.mutateAsync({
        customerName: customerName.trim(),
        customerRef: customerRef.trim() || null,
        productItemId: productItem!.id,
        bomTemplateId,
        orderQty: Number(orderQty),
        dueDate: dueDateValue,
        priority,
        notes: notes.trim() || null,
      });
      toast.success(`Đã tạo đơn hàng cho khách "${customerName.trim()}".`);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Tạo đơn hàng thất bại");
    }
  };

  const pending = createOrder.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            Tạo đơn hàng từ BOM {bomTemplateCode}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Đơn hàng sẽ ở trạng thái Nháp, gắn sẵn với BOM hiện tại để snapshot
            sau này.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="co-customer" required>
                Khách hàng
              </Label>
              <Input
                id="co-customer"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="VD: Công ty ABC"
                error={!!errors.customerName}
                autoFocus
              />
              {errors.customerName ? (
                <p className="text-[11px] text-red-600">{errors.customerName}</p>
              ) : (
                <p className="text-[11px] text-zinc-400">2-128 ký tự</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="co-customer-ref">Mã tham chiếu</Label>
              <Input
                id="co-customer-ref"
                value={customerRef}
                onChange={(e) => setCustomerRef(e.target.value)}
                placeholder="PO khách (tuỳ chọn)"
              />
              <p className="text-[11px] text-zinc-400">Tối đa 128 ký tự</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="co-product" required>
              Sản phẩm
            </Label>
            <ItemPicker
              id="co-product"
              value={productItem}
              onChange={setProductItem}
              placeholder="Chọn SKU sản phẩm..."
            />
            {errors.productItemId ? (
              <p className="text-[11px] text-red-600">{errors.productItemId}</p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Sản phẩm đầu ra của đơn hàng (thường = item cha của BOM).
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="co-qty" required>
                Số lượng
              </Label>
              <Input
                id="co-qty"
                type="number"
                step="0.0001"
                min={0}
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                error={!!errors.orderQty}
                className="tabular-nums"
              />
              {errors.orderQty ? (
                <p className="text-[11px] text-red-600">{errors.orderQty}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="co-due">Deadline</Label>
              <Input
                id="co-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="co-priority" required>
                Ưu tiên
              </Label>
              <select
                id="co-priority"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as OrderPriority)
                }
                className="flex h-9 w-full items-center rounded-md border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 focus:border-indigo-500 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                {ORDER_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {ORDER_PRIORITY_LABELS[p as OrderPriority]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="co-notes">Ghi chú</Label>
            <Textarea
              id="co-notes"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Tạo đơn hàng
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
