"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateBoardItem,
  useUpdateBoardItem,
  type BoardItem,
  type BoardStatus,
} from "@/hooks/useProductionBoard";

/**
 * V3.8 — Dialog tạo/sửa mã hàng trên Bảng sản xuất (QC lead).
 */

const STATUS_OPTIONS: Array<{ value: BoardStatus; label: string }> = [
  { value: "QUEUED", label: "Sắp gia công" },
  { value: "IN_PROGRESS", label: "Đang gia công" },
  { value: "QC", label: "Đang kiểm (QC)" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "DELIVERED", label: "Đã giao" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Có item → edit; không → create. */
  item?: BoardItem | null;
}

export function BoardItemDialog({ open, onOpenChange, item }: Props) {
  const isEdit = !!item;
  const createMut = useCreateBoardItem();
  const updateMut = useUpdateBoardItem();

  const [form, setForm] = React.useState({
    productCode: "",
    rfqNo: "",
    productName: "",
    customer: "",
    qtyPlanned: "0",
    qtyDone: "0",
    uom: "Pcs",
    status: "QUEUED" as BoardStatus,
    deadline: "",
    currentStage: "",
    notes: "",
    isPinned: false,
  });

  // Reset form khi mở dialog / đổi item.
  React.useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        productCode: item.productCode,
        rfqNo: item.rfqNo ?? "",
        productName: item.productName,
        customer: item.customer ?? "",
        qtyPlanned: String(item.qtyPlanned ?? "0"),
        qtyDone: String(item.qtyDone ?? "0"),
        uom: item.uom ?? "Pcs",
        status: item.status,
        deadline: item.deadline ? item.deadline.slice(0, 10) : "",
        currentStage: item.currentStage ?? "",
        notes: item.notes ?? "",
        isPinned: item.isPinned,
      });
    } else {
      setForm({
        productCode: "",
        rfqNo: "",
        productName: "",
        customer: "",
        qtyPlanned: "0",
        qtyDone: "0",
        uom: "Pcs",
        status: "QUEUED",
        deadline: "",
        currentStage: "",
        notes: "",
        isPinned: false,
      });
    }
  }, [open, item]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const busy = createMut.isPending || updateMut.isPending;

  const handleSubmit = async () => {
    if (!form.productCode.trim()) {
      toast.error("Nhập Mã hàng");
      return;
    }
    if (!form.productName.trim()) {
      toast.error("Nhập Tên/Spec sản phẩm");
      return;
    }
    const payload = {
      productCode: form.productCode.trim(),
      rfqNo: form.rfqNo.trim() || null,
      productName: form.productName.trim(),
      customer: form.customer.trim() || null,
      qtyPlanned: Number(form.qtyPlanned) || 0,
      qtyDone: Number(form.qtyDone) || 0,
      uom: form.uom.trim() || "Pcs",
      status: form.status,
      deadline: form.deadline || null,
      currentStage: form.currentStage.trim() || null,
      notes: form.notes.trim() || null,
      isPinned: form.isPinned,
    };
    try {
      if (isEdit && item) {
        await updateMut.mutateAsync({ id: item.id, payload });
        toast.success(`Đã cập nhật ${payload.productCode}`);
      } else {
        await createMut.mutateAsync(payload);
        toast.success(`Đã thêm ${payload.productCode}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa mã hàng" : "Thêm mã hàng vào bảng"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Mã hàng (BQMS) *" className="col-span-2 sm:col-span-1">
            <Input
              value={form.productCode}
              onChange={(e) => set("productCode", e.target.value)}
              placeholder="Z0000002-259491"
              autoFocus
            />
          </Field>
          <Field label="Mã RFQ" className="col-span-2 sm:col-span-1">
            <Input
              value={form.rfqNo}
              onChange={(e) => set("rfqNo", e.target.value)}
              placeholder="QT25052426"
            />
          </Field>
          <Field label="Tên / Spec sản phẩm *" className="col-span-2">
            <Textarea
              value={form.productName}
              onChange={(e) => set("productName", e.target.value)}
              placeholder="BASE B_VINYL B ATTACH COMMON, L161xW66xH26 mm, PB108"
              rows={2}
            />
          </Field>
          <Field label="Khách hàng" className="col-span-2 sm:col-span-1">
            <Input
              value={form.customer}
              onChange={(e) => set("customer", e.target.value)}
              placeholder="SEVT / SEV"
            />
          </Field>
          <Field label="Công đoạn hiện tại" className="col-span-2 sm:col-span-1">
            <Input
              value={form.currentStage}
              onChange={(e) => set("currentStage", e.target.value)}
              placeholder="CNC 02 / Đánh bóng…"
            />
          </Field>

          <Field label="SL kế hoạch">
            <Input
              type="number"
              min={0}
              value={form.qtyPlanned}
              onChange={(e) => set("qtyPlanned", e.target.value)}
            />
          </Field>
          <Field label="SL đã đạt">
            <Input
              type="number"
              min={0}
              value={form.qtyDone}
              onChange={(e) => set("qtyDone", e.target.value)}
            />
          </Field>
          <Field label="ĐVT">
            <Input
              value={form.uom}
              onChange={(e) => set("uom", e.target.value)}
              placeholder="Pcs / Set"
            />
          </Field>
          <Field label="Hạn giao">
            <Input
              type="date"
              value={form.deadline}
              onChange={(e) => set("deadline", e.target.value)}
            />
          </Field>

          <Field label="Trạng thái" className="col-span-2 sm:col-span-1">
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v as BoardStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={form.isPinned}
                onChange={(e) => set("isPinned", e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              ★ Ghim lên đầu bảng (ưu tiên/khẩn)
            </label>
          </div>

          <Field label="Ghi chú" className="col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Thêm vào bảng"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </Label>
      {children}
    </div>
  );
}
