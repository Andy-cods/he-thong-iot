"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_STATUSES,
  ITEM_STATUS_LABELS,
  UOMS,
  UOM_LABELS,
  itemCreateSchema,
  type ItemCreate,
  type ItemCreateInput,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCheckSku } from "@/hooks/useItems";
import { cn } from "@/lib/utils";

type Mode = "create" | "edit";

export interface ItemFormProps {
  mode: Mode;
  defaultValues?: Partial<ItemCreateInput> & { id?: string };
  onSubmit: (data: ItemCreate) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export function ItemForm({
  mode,
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: ItemFormProps) {
  const form = useForm<ItemCreateInput>({
    resolver: zodResolver(itemCreateSchema),
    defaultValues: {
      sku: "",
      name: "",
      itemType: "RAW",
      uom: "PCS",
      status: "ACTIVE",
      category: "",
      description: "",
      minStockQty: 0,
      reorderQty: 0,
      leadTimeDays: 0,
      isLotTracked: false,
      isSerialTracked: false,
      ...defaultValues,
    },
  });

  const skuValue = form.watch("sku") ?? "";
  const debouncedSku = useDebounced(
    typeof skuValue === "string" ? skuValue.toUpperCase() : "",
    300,
  );

  const skuCheck = useCheckSku(mode === "create" ? debouncedSku : "");
  const skuTaken = mode === "create" && skuCheck.data?.data?.exists === true;

  return (
    <form
      onSubmit={form.handleSubmit((values) => onSubmit(values as ItemCreate))}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-1 space-y-1">
          <Label htmlFor="sku">Mã SKU *</Label>
          <Input
            id="sku"
            disabled={mode === "edit"}
            placeholder="RM-0001"
            {...form.register("sku")}
            aria-invalid={!!form.formState.errors.sku || skuTaken}
          />
          <p
            className={cn(
              "min-h-[16px] text-xs",
              skuTaken
                ? "text-danger"
                : debouncedSku && !form.formState.errors.sku
                  ? "text-success"
                  : "text-slate-500",
            )}
          >
            {form.formState.errors.sku?.message ??
              (skuTaken
                ? "Mã đã tồn tại."
                : debouncedSku.length >= 2 && skuCheck.isSuccess
                  ? "Mã khả dụng."
                  : "A-Z, 0-9, _ - ; 2-64 ký tự")}
          </p>
        </div>
        <div className="col-span-1 space-y-1">
          <Label htmlFor="name">Tên vật tư *</Label>
          <Input id="name" {...form.register("name")} />
          <p className="min-h-[16px] text-xs text-danger">
            {form.formState.errors.name?.message}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Loại *</Label>
          <Select
            value={form.watch("itemType")}
            onValueChange={(v) => form.setValue("itemType", v as ItemCreate["itemType"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ITEM_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Đơn vị *</Label>
          <Select
            value={form.watch("uom")}
            onValueChange={(v) => form.setValue("uom", v as ItemCreate["uom"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UOMS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u} — {UOM_LABELS[u]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Trạng thái</Label>
          <Select
            value={form.watch("status") ?? "ACTIVE"}
            onValueChange={(v) =>
              form.setValue("status", v as ItemCreate["status"])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ITEM_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="category">Nhóm / category</Label>
          <Input
            id="category"
            placeholder="Thép tấm…"
            {...form.register("category")}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="leadTimeDays">Lead time (ngày)</Label>
          <Input
            id="leadTimeDays"
            type="number"
            min={0}
            {...form.register("leadTimeDays", { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="minStockQty">Tồn tối thiểu</Label>
          <Input
            id="minStockQty"
            type="number"
            step="0.0001"
            min={0}
            {...form.register("minStockQty", { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="reorderQty">Số lượng đặt lại</Label>
          <Input
            id="reorderQty"
            type="number"
            step="0.0001"
            min={0}
            {...form.register("reorderQty", { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Mô tả</Label>
        <Textarea
          id="description"
          rows={3}
          {...form.register("description")}
        />
      </div>

      <div className="flex items-center gap-4 text-sm text-slate-700">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            {...form.register("isLotTracked")}
          />
          Quản lý theo lô
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            {...form.register("isSerialTracked")}
          />
          Quản lý theo serial
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Huỷ
          </Button>
        )}
        <Button
          type="submit"
          disabled={submitting || skuTaken}
        >
          {submitting ? "Đang lưu…" : mode === "create" ? "Tạo mới" : "Lưu"}
        </Button>
      </div>
    </form>
  );
}
