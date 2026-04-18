"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ChevronDown } from "lucide-react";
import {
  orderCreateSchema,
  ORDER_PRIORITIES,
  ORDER_PRIORITY_LABELS,
  type OrderCreate,
  type OrderPriority,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemPicker, type ItemPickerValue } from "@/components/bom/ItemPicker";
import { cn } from "@/lib/utils";

type Mode = "create" | "edit";

/**
 * Input type của form — dueDate là string (HTML input) hoặc null,
 * khác với output Zod đã transform thành Date. onSubmit nhận output type
 * OrderCreate (Date).
 */
export interface OrderFormInput {
  customerName: string;
  customerRef?: string | null;
  productItemId: string;
  bomTemplateId?: string | null;
  orderQty: number;
  dueDate?: string | Date | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  notes?: string | null;
}

export interface OrderFormProps {
  mode: Mode;
  defaultValues?: Partial<OrderFormInput> & {
    productItem?: ItemPickerValue | null;
  };
  onSubmit: (data: OrderCreate) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  readOnly?: boolean;
}

/**
 * V1.2 OrderForm — pattern BomForm: Accordion 2 section.
 * Section 1: Thông tin cơ bản (customer, product, deadline).
 * Section 2: Chi tiết (quantity, priority, notes).
 *
 * `readOnly` = true → mọi field disabled, không submit button
 * (dùng cho tab "Thông tin" detail page).
 */
export function OrderForm({
  mode,
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
  onDirtyChange,
  readOnly,
}: OrderFormProps) {
  // Cast defaultValues: dueDate là string HTML input, Zod transform Date khi submit.
  const form = useForm<OrderCreate>({
    resolver: zodResolver(orderCreateSchema),
    defaultValues: {
      customerName: "",
      customerRef: "",
      productItemId: "",
      bomTemplateId: null,
      orderQty: 1,
      dueDate: null,
      priority: "NORMAL",
      notes: "",
      ...(defaultValues as Partial<OrderCreate>),
    },
    mode: "onBlur",
  });

  const [productItem, setProductItem] = React.useState<ItemPickerValue | null>(
    defaultValues?.productItem ?? null,
  );

  const isDirty = form.formState.isDirty;
  React.useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const errors = form.formState.errors;

  return (
    <form
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          ...values,
          productItemId: productItem?.id ?? values.productItemId,
        }),
      )}
      className="mx-auto w-full max-w-3xl space-y-6 p-6"
      noValidate
    >
      <Section title="Thông tin cơ bản" defaultOpen>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <Label htmlFor="customerName" uppercase required>
              Khách hàng
            </Label>
            <Input
              id="customerName"
              placeholder="VD: Công ty ABC"
              disabled={readOnly}
              aria-invalid={!!errors.customerName}
              {...form.register("customerName")}
              className={cn(errors.customerName && "border-red-500")}
            />
            <HelperText tone={errors.customerName ? "error" : "muted"}>
              {errors.customerName?.message ?? "2-128 ký tự"}
            </HelperText>
          </Field>

          <Field>
            <Label htmlFor="customerRef" uppercase>
              Mã tham chiếu
            </Label>
            <Input
              id="customerRef"
              placeholder="PO số khách cung cấp (tuỳ chọn)"
              disabled={readOnly}
              {...form.register("customerRef")}
            />
            <HelperText tone="muted">Tối đa 128 ký tự</HelperText>
          </Field>
        </div>

        <Field>
          <Label htmlFor="product-item" uppercase required>
            Sản phẩm
          </Label>
          <ItemPicker
            id="product-item"
            value={productItem}
            onChange={(v) => {
              setProductItem(v);
              form.setValue("productItemId", v?.id ?? "", {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            placeholder="Chọn SKU sản phẩm..."
            disabled={readOnly}
          />
          <HelperText tone={errors.productItemId ? "error" : "muted"}>
            {errors.productItemId?.message ?? "Sản phẩm đầu ra của đơn hàng"}
          </HelperText>
        </Field>

        <Field>
          <Label htmlFor="dueDate" uppercase>
            Deadline
          </Label>
          <Input
            id="dueDate"
            type="date"
            disabled={readOnly}
            className="tabular-nums md:w-[200px]"
            {...form.register("dueDate")}
          />
          <HelperText tone="muted">Ngày giao hàng dự kiến</HelperText>
        </Field>
      </Section>

      <Section title="Chi tiết" defaultOpen>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[160px_200px]">
          <Field>
            <Label htmlFor="orderQty" uppercase required>
              Số lượng
            </Label>
            <Input
              id="orderQty"
              type="number"
              step="0.0001"
              min={0}
              disabled={readOnly}
              className="tabular-nums"
              aria-invalid={!!errors.orderQty}
              {...form.register("orderQty", { valueAsNumber: true })}
            />
            <HelperText tone={errors.orderQty ? "error" : "muted"}>
              {errors.orderQty?.message ?? "Số lượng đặt hàng"}
            </HelperText>
          </Field>

          <Field>
            <Label htmlFor="priority" uppercase required>
              Ưu tiên
            </Label>
            <select
              id="priority"
              disabled={readOnly}
              {...form.register("priority")}
              className={cn(
                "h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-base text-zinc-900",
                "focus:border-blue-500 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500",
                "disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400",
              )}
            >
              {ORDER_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {ORDER_PRIORITY_LABELS[p as OrderPriority]}
                </option>
              ))}
            </select>
            <HelperText tone="muted">Ưu tiên sản xuất</HelperText>
          </Field>
        </div>

        <Field>
          <Label htmlFor="notes" uppercase>
            Ghi chú
          </Label>
          <Textarea
            id="notes"
            rows={3}
            disabled={readOnly}
            placeholder="Yêu cầu đặc biệt, ghi chú giao hàng..."
            {...form.register("notes")}
          />
          <HelperText tone="muted">Tối đa 2000 ký tự</HelperText>
        </Field>
      </Section>

      {!readOnly && (
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-4">
          {onCancel && (
            <Button type="button" variant="ghost" size="md" onClick={onCancel}>
              Huỷ
            </Button>
          )}
          <Button
            type="submit"
            size="md"
            disabled={submitting}
          >
            {submitting
              ? "Đang lưu…"
              : mode === "create"
                ? "Tạo đơn hàng"
                : "Lưu"}
          </Button>
        </div>
      )}
    </form>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

function HelperText({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "success" | "error";
}) {
  const color =
    tone === "error"
      ? "text-red-700"
      : tone === "success"
        ? "text-emerald-700"
        : "text-zinc-500";
  return <p className={cn("min-h-4 text-sm", color)}>{children}</p>;
}

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
      className="group rounded-md border border-zinc-200 bg-white"
    >
      <summary className="flex h-10 cursor-pointer list-none items-center justify-between px-4 text-base font-medium text-zinc-900 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown
          className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-4 border-t border-zinc-100 p-4">{children}</div>
    </details>
  );
}
