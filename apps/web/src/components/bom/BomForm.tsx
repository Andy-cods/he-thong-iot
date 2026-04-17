"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckCircle2, ChevronDown, Loader2, XCircle } from "lucide-react";
import {
  bomTemplateCreateSchema,
  type BomTemplateCreate,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBomCheckCode } from "@/hooks/useBom";
import { ItemPicker, type ItemPickerValue } from "./ItemPicker";
import { cn } from "@/lib/utils";

type Mode = "create" | "edit";

export interface BomFormProps {
  mode: Mode;
  defaultValues?: Partial<BomTemplateCreate> & {
    id?: string;
    parentItem?: ItemPickerValue | null;
  };
  onSubmit: (data: BomTemplateCreate) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  /** excludeId cho check-code (edit mode). */
  excludeId?: string;
}

/**
 * V2 BomForm — pattern ItemForm: Accordion 2 section.
 * Fields: code (unique check) + name + description + parent_item + target_qty.
 */
export function BomForm({
  mode,
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
  onDirtyChange,
  excludeId,
}: BomFormProps) {
  const form = useForm<BomTemplateCreate>({
    resolver: zodResolver(bomTemplateCreateSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      parentItemId: null,
      targetQty: 1,
      ...defaultValues,
    },
    mode: "onBlur",
  });

  const [parentItem, setParentItem] = React.useState<ItemPickerValue | null>(
    defaultValues?.parentItem ?? null,
  );

  const isDirty = form.formState.isDirty;
  React.useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const codeValue = form.watch("code") ?? "";
  const normalizedCode =
    typeof codeValue === "string" ? codeValue.toUpperCase() : "";

  const codeCheck = useBomCheckCode(
    mode === "create" ? normalizedCode : "",
    excludeId,
  );
  const codeTaken =
    mode === "create" &&
    codeCheck.data?.data?.available === false &&
    normalizedCode.length >= 2;
  const codeOk =
    mode === "create" &&
    codeCheck.data?.data?.available === true &&
    normalizedCode.length >= 2;

  return (
    <form
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          ...values,
          parentItemId: parentItem?.id ?? null,
        }),
      )}
      className="mx-auto w-full max-w-3xl space-y-6 p-6"
      noValidate
    >
      <Section title="Thông tin cơ bản" defaultOpen>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <Label htmlFor="code" uppercase required>
              Mã BOM
            </Label>
            <div className="relative">
              <Input
                id="code"
                disabled={mode === "edit"}
                placeholder="VD: BOM-MAY-PH-A"
                {...form.register("code")}
                aria-invalid={!!form.formState.errors.code || codeTaken}
                autoComplete="off"
                className={cn(
                  (codeTaken || form.formState.errors.code) &&
                    "border-red-500 focus:border-red-500",
                  codeOk && "border-emerald-500",
                )}
              />
              {mode === "create" && normalizedCode.length >= 2 && (
                <CodeIndicator
                  loading={codeCheck.isFetching}
                  taken={codeTaken}
                  ok={codeOk}
                />
              )}
            </div>
            <HelperText
              tone={
                form.formState.errors.code || codeTaken
                  ? "error"
                  : codeOk
                    ? "success"
                    : "muted"
              }
            >
              {form.formState.errors.code?.message ??
                (codeTaken
                  ? "Mã đã tồn tại."
                  : codeOk
                    ? "Mã khả dụng."
                    : "A-Z, 0-9, _ - ; 2-64 ký tự")}
            </HelperText>
          </Field>

          <Field>
            <Label htmlFor="name" uppercase required>
              Tên BOM
            </Label>
            <Input
              id="name"
              placeholder="VD: BOM máy phay CNC model A"
              aria-invalid={!!form.formState.errors.name}
              {...form.register("name")}
              className={cn(
                form.formState.errors.name && "border-red-500",
              )}
            />
            <HelperText
              tone={form.formState.errors.name ? "error" : "muted"}
            >
              {form.formState.errors.name?.message ?? "Tối đa 255 ký tự"}
            </HelperText>
          </Field>
        </div>

        <Field>
          <Label htmlFor="description" uppercase>
            Mô tả
          </Label>
          <Textarea
            id="description"
            rows={3}
            placeholder="Ghi chú, quy cách chung..."
            {...form.register("description")}
          />
          <HelperText tone="muted">Tối đa 2000 ký tự</HelperText>
        </Field>
      </Section>

      <Section title="Sản phẩm đầu ra" defaultOpen>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
          <Field>
            <Label htmlFor="parent-item" uppercase>
              Vật tư đầu ra (tuỳ chọn)
            </Label>
            <ItemPicker
              id="parent-item"
              value={parentItem}
              onChange={(v) => {
                setParentItem(v);
                form.setValue("parentItemId", v?.id ?? null, {
                  shouldDirty: true,
                });
              }}
              placeholder="Chọn SKU thành phẩm..."
            />
            <HelperText tone="muted">
              SKU của sản phẩm sẽ sản xuất theo BOM này (có thể để trống ở
              nháp)
            </HelperText>
          </Field>
          <Field>
            <Label htmlFor="target-qty" uppercase required>
              Target Qty
            </Label>
            <Input
              id="target-qty"
              type="number"
              step="0.0001"
              min={0}
              className="tabular-nums"
              {...form.register("targetQty", { valueAsNumber: true })}
            />
            <HelperText
              tone={form.formState.errors.targetQty ? "error" : "muted"}
            >
              {form.formState.errors.targetQty?.message ??
                "SL sản phẩm mỗi lần chạy"}
            </HelperText>
          </Field>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" size="md" onClick={onCancel}>
            Huỷ
          </Button>
        )}
        <Button
          type="submit"
          size="md"
          disabled={
            submitting ||
            codeTaken ||
            (!form.formState.isValid && form.formState.isSubmitted)
          }
        >
          {submitting
            ? "Đang lưu…"
            : mode === "create"
              ? "Tạo BOM"
              : "Lưu"}
        </Button>
      </div>
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

function CodeIndicator({
  loading,
  taken,
  ok,
}: {
  loading?: boolean;
  taken?: boolean;
  ok?: boolean;
}) {
  return (
    <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-xs">
      {loading ? (
        <>
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-zinc-400"
            aria-hidden="true"
          />
          <span className="text-zinc-400">Đang kiểm tra</span>
        </>
      ) : taken ? (
        <>
          <XCircle className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
          <span className="text-red-700">Đã tồn tại</span>
        </>
      ) : ok ? (
        <>
          <CheckCircle2
            className="h-3.5 w-3.5 text-emerald-600"
            aria-hidden="true"
          />
          <span className="text-emerald-700">Khả dụng</span>
        </>
      ) : null}
    </div>
  );
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
