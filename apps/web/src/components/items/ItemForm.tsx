"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ChevronDown } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  /** Callback khi form dirty state thay đổi — dùng cho QuickEditSheet. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Ẩn row [Huỷ] [Lưu] khi caller tự render (VD: Sheet footer). */
  hideFormActions?: boolean;
  /** Form id để submit từ external button (form="…"). */
  formId?: string;
}

function useDebounced<T>(value: T, delay = 400): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/**
 * ItemForm — polished (T7 Step 5).
 *
 * 4 section accordion: Thông tin cơ bản / Kho & bổ sung / Tracking / Mô tả.
 * Section có thể collapse nhưng mặc định open cho create, edit giữ open.
 * Helper text reserve space (min-h-5) tránh layout jank.
 * SKU check debounce 400ms.
 * Checkbox dùng shadcn.
 */
export function ItemForm({
  mode,
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
  onDirtyChange,
  hideFormActions,
  formId,
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
    mode: "onBlur",
  });

  const isDirty = form.formState.isDirty;
  React.useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const skuValue = form.watch("sku") ?? "";
  const debouncedSku = useDebounced(
    typeof skuValue === "string" ? skuValue.toUpperCase() : "",
    400,
  );

  const skuCheck = useCheckSku(mode === "create" ? debouncedSku : "");
  const skuTaken = mode === "create" && skuCheck.data?.data?.exists === true;

  const isLotTracked = form.watch("isLotTracked");
  const isSerialTracked = form.watch("isSerialTracked");

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit((values) => onSubmit(values as ItemCreate))}
      className="space-y-4"
      noValidate
    >
      <Section title="Thông tin cơ bản" defaultOpen>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field>
            <Label htmlFor="sku" required>
              Mã SKU
            </Label>
            <Input
              id="sku"
              disabled={mode === "edit"}
              placeholder="VD: RM-0001"
              {...form.register("sku")}
              aria-invalid={!!form.formState.errors.sku || skuTaken}
              aria-describedby="sku-helper"
              autoComplete="off"
            />
            <HelperText
              id="sku-helper"
              tone={
                form.formState.errors.sku || skuTaken
                  ? "error"
                  : debouncedSku && skuCheck.isSuccess && mode === "create"
                    ? "success"
                    : "muted"
              }
            >
              {form.formState.errors.sku?.message ??
                (skuTaken
                  ? "Mã đã tồn tại."
                  : debouncedSku.length >= 2 && skuCheck.isSuccess
                    ? "Mã khả dụng."
                    : "A-Z, 0-9, _ - ; 2-64 ký tự")}
            </HelperText>
          </Field>

          <Field>
            <Label htmlFor="name" required>
              Tên vật tư
            </Label>
            <Input
              id="name"
              placeholder="VD: Thép hợp kim C45 φ30"
              aria-invalid={!!form.formState.errors.name}
              aria-describedby="name-helper"
              {...form.register("name")}
            />
            <HelperText
              id="name-helper"
              tone={form.formState.errors.name ? "error" : "muted"}
            >
              {form.formState.errors.name?.message ?? "Tối đa 255 ký tự"}
            </HelperText>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field>
            <Label required>Loại</Label>
            <Select
              value={form.watch("itemType")}
              onValueChange={(v) => {
                form.setValue("itemType", v as ItemCreate["itemType"], {
                  shouldDirty: true,
                });
              }}
            >
              <SelectTrigger aria-label="Loại vật tư">
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
            <HelperText tone="muted">Phân nhóm BOM/warehouse</HelperText>
          </Field>

          <Field>
            <Label required>Đơn vị tính</Label>
            <Select
              value={form.watch("uom")}
              onValueChange={(v) =>
                form.setValue("uom", v as ItemCreate["uom"], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger aria-label="Đơn vị tính">
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
            <HelperText tone="muted">Không đổi sau khi đã có nhập xuất</HelperText>
          </Field>

          <Field>
            <Label>Trạng thái</Label>
            <Select
              value={form.watch("status") ?? "ACTIVE"}
              onValueChange={(v) =>
                form.setValue("status", v as ItemCreate["status"], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger aria-label="Trạng thái">
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
            <HelperText tone="muted">&nbsp;</HelperText>
          </Field>
        </div>
      </Section>

      <Section title="Kho & bổ sung" defaultOpen>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field>
            <Label htmlFor="category">Nhóm / category</Label>
            <Input
              id="category"
              placeholder="VD: Thép tấm"
              {...form.register("category")}
            />
            <HelperText tone="muted">Dùng cho lọc nhanh danh sách</HelperText>
          </Field>
          <Field>
            <Label htmlFor="leadTimeDays">Lead time (ngày)</Label>
            <Input
              id="leadTimeDays"
              type="number"
              min={0}
              {...form.register("leadTimeDays", { valueAsNumber: true })}
            />
            <HelperText tone="muted">Thời gian bổ sung mặc định</HelperText>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field>
            <Label htmlFor="minStockQty">Tồn tối thiểu</Label>
            <Input
              id="minStockQty"
              type="number"
              step="0.0001"
              min={0}
              {...form.register("minStockQty", { valueAsNumber: true })}
            />
            <HelperText tone="muted">Cảnh báo khi tồn thấp hơn</HelperText>
          </Field>
          <Field>
            <Label htmlFor="reorderQty">Số lượng đặt lại</Label>
            <Input
              id="reorderQty"
              type="number"
              step="0.0001"
              min={0}
              {...form.register("reorderQty", { valueAsNumber: true })}
            />
            <HelperText tone="muted">Gợi ý SL đặt hàng kế tiếp</HelperText>
          </Field>
        </div>
      </Section>

      <Section title="Tracking">
        <div className="space-y-3">
          <label className="flex items-start gap-2">
            <Checkbox
              checked={isLotTracked}
              onCheckedChange={(v) =>
                form.setValue("isLotTracked", v === true, {
                  shouldDirty: true,
                })
              }
              aria-label="Quản lý theo lô"
              className="mt-0.5"
            />
            <span>
              <span className="text-sm font-medium text-slate-900">
                Quản lý theo lô
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Ghi nhận lot_no khi nhập/xuất kho
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <Checkbox
              checked={isSerialTracked}
              onCheckedChange={(v) =>
                form.setValue("isSerialTracked", v === true, {
                  shouldDirty: true,
                })
              }
              aria-label="Quản lý theo serial"
              className="mt-0.5"
            />
            <span>
              <span className="text-sm font-medium text-slate-900">
                Quản lý theo serial
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Ghi nhận serial từng pcs (FG / jig chuyên dụng)
              </span>
            </span>
          </label>
        </div>
      </Section>

      <Section title="Mô tả">
        <Field>
          <Label htmlFor="description">Mô tả chi tiết</Label>
          <Textarea
            id="description"
            rows={4}
            placeholder="Thông tin kỹ thuật, quy cách…"
            {...form.register("description")}
          />
          <HelperText tone="muted">Tối đa 2000 ký tự</HelperText>
        </Field>
      </Section>

      {!hideFormActions && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Huỷ
            </Button>
          )}
          <Button
            type="submit"
            disabled={submitting || skuTaken || !form.formState.isValid && form.formState.isSubmitted}
          >
            {submitting
              ? "Đang lưu…"
              : mode === "create"
                ? "Tạo mới"
                : "Lưu"}
          </Button>
        </div>
      )}
    </form>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1">{children}</div>;
}

function HelperText({
  children,
  tone = "muted",
  id,
}: {
  children: React.ReactNode;
  tone?: "muted" | "success" | "error";
  id?: string;
}) {
  const color =
    tone === "error"
      ? "text-danger-strong"
      : tone === "success"
        ? "text-success-strong"
        : "text-slate-500";
  return (
    <p id={id} className={cn("min-h-5 text-xs", color)}>
      {children}
    </p>
  );
}

/**
 * Section — accordion-style group với chevron toggle.
 * Dùng <details>/<summary> cho native semantics + keyboard free.
 */
function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded border border-slate-200 bg-white open:shadow-xs"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown
          className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-3 border-t border-slate-200 p-4">{children}</div>
    </details>
  );
}
