"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckCircle2, ChevronDown, Loader2, XCircle } from "lucide-react";
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
 * V2 ItemForm — Linear-inspired spacious (design-spec §2.5 + impl-plan §8.T8).
 *
 * - Wrapper max-w-[720px] mx-auto padding 24 (p-6).
 * - Section spacing gap-6 (24px) giữa Accordion panels.
 * - Accordion (<details>): header h-10 px-4 font-medium 13px + content padding 16.
 * - Label: uppercase 11px tracking-wide font-medium zinc-700, required * red-500.
 * - Input h-9 (36px) font 13px — default V2 Input size.
 * - Grid 2-col md: gap-4.
 * - Helper text min-h-4 text-xs zinc-500 (error red-700) — reserve space.
 * - Submit button primary blue-500 h-9 px-4 + Cancel ghost h-9.
 * - SKU check indicator inline right của input, icon 14px + text-xs.
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
  const skuShowSuccess =
    mode === "create" &&
    debouncedSku.length >= 2 &&
    skuCheck.isSuccess &&
    !skuTaken;

  const isLotTracked = form.watch("isLotTracked");
  const isSerialTracked = form.watch("isSerialTracked");

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit((values) => onSubmit(values as ItemCreate))}
      className="mx-auto w-full max-w-[720px] space-y-6 p-6"
      noValidate
    >
      <Section title="Thông tin cơ bản" defaultOpen>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <Label htmlFor="sku" uppercase required>
              Mã SKU
            </Label>
            <div className="relative">
              <Input
                id="sku"
                disabled={mode === "edit"}
                placeholder="VD: RM-0001"
                {...form.register("sku")}
                aria-invalid={!!form.formState.errors.sku || skuTaken}
                aria-describedby="sku-helper"
                autoComplete="off"
                className={cn(
                  (skuTaken || form.formState.errors.sku) &&
                    "border-red-500 focus:border-red-500 focus-visible:outline-red-500",
                  skuShowSuccess && "border-emerald-500",
                )}
              />
              {mode === "create" && debouncedSku.length >= 2 && (
                <SkuIndicator
                  loading={skuCheck.isFetching}
                  taken={skuTaken}
                  ok={skuShowSuccess}
                />
              )}
            </div>
            <HelperText
              id="sku-helper"
              tone={
                form.formState.errors.sku || skuTaken
                  ? "error"
                  : skuShowSuccess
                    ? "success"
                    : "muted"
              }
            >
              {form.formState.errors.sku?.message ??
                (skuTaken
                  ? "Mã đã tồn tại."
                  : skuShowSuccess
                    ? "Mã khả dụng."
                    : "A-Z, 0-9, _ - ; 2-64 ký tự")}
            </HelperText>
          </Field>

          <Field>
            <Label htmlFor="name" uppercase required>
              Tên vật tư
            </Label>
            <Input
              id="name"
              placeholder="VD: Thép hợp kim C45 φ30"
              aria-invalid={!!form.formState.errors.name}
              aria-describedby="name-helper"
              {...form.register("name")}
              className={cn(
                form.formState.errors.name &&
                  "border-red-500 focus:border-red-500 focus-visible:outline-red-500",
              )}
            />
            <HelperText
              id="name-helper"
              tone={form.formState.errors.name ? "error" : "muted"}
            >
              {form.formState.errors.name?.message ?? "Tối đa 255 ký tự"}
            </HelperText>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field>
            <Label uppercase required>
              Loại
            </Label>
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
            <Label uppercase required>
              Đơn vị tính
            </Label>
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
            <HelperText tone="muted">
              Không đổi sau khi đã có nhập xuất
            </HelperText>
          </Field>

          <Field>
            <Label uppercase>Trạng thái</Label>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <Label htmlFor="category" uppercase>
              Nhóm / danh mục
            </Label>
            <Input
              id="category"
              placeholder="VD: Thép tấm"
              {...form.register("category")}
            />
            <HelperText tone="muted">Dùng cho lọc nhanh danh sách</HelperText>
          </Field>
          <Field>
            <Label htmlFor="leadTimeDays" uppercase>
              Lead time (ngày)
            </Label>
            <Input
              id="leadTimeDays"
              type="number"
              min={0}
              className="tabular-nums"
              {...form.register("leadTimeDays", { valueAsNumber: true })}
            />
            <HelperText tone="muted">Thời gian bổ sung mặc định</HelperText>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <Label htmlFor="minStockQty" uppercase>
              Tồn tối thiểu
            </Label>
            <Input
              id="minStockQty"
              type="number"
              step="0.0001"
              min={0}
              className="tabular-nums"
              {...form.register("minStockQty", { valueAsNumber: true })}
            />
            <HelperText tone="muted">Cảnh báo khi tồn thấp hơn</HelperText>
          </Field>
          <Field>
            <Label htmlFor="reorderQty" uppercase>
              Số lượng đặt lại
            </Label>
            <Input
              id="reorderQty"
              type="number"
              step="0.0001"
              min={0}
              className="tabular-nums"
              {...form.register("reorderQty", { valueAsNumber: true })}
            />
            <HelperText tone="muted">Gợi ý SL đặt hàng kế tiếp</HelperText>
          </Field>
        </div>
      </Section>

      <Section title="Tracking">
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-sm p-2 hover:bg-zinc-50">
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
              <span className="block text-base font-medium text-zinc-900">
                Quản lý theo lô
              </span>
              <span className="mt-0.5 block text-sm text-zinc-500">
                Ghi nhận lot_no khi nhập/xuất kho
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-sm p-2 hover:bg-zinc-50">
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
              <span className="block text-base font-medium text-zinc-900">
                Quản lý theo serial
              </span>
              <span className="mt-0.5 block text-sm text-zinc-500">
                Ghi nhận serial từng pcs (FG / jig chuyên dụng)
              </span>
            </span>
          </label>
        </div>
      </Section>

      <Section title="Mô tả">
        <Field>
          <Label htmlFor="description" uppercase>
            Mô tả chi tiết
          </Label>
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
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-4">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onCancel}
            >
              Huỷ
            </Button>
          )}
          <Button
            type="submit"
            size="md"
            disabled={
              submitting ||
              skuTaken ||
              (!form.formState.isValid && form.formState.isSubmitted)
            }
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
  return <div className="space-y-1.5">{children}</div>;
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
      ? "text-red-700"
      : tone === "success"
        ? "text-emerald-700"
        : "text-zinc-500";
  return (
    <p id={id} className={cn("min-h-4 text-sm", color)}>
      {children}
    </p>
  );
}

function SkuIndicator({
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

/**
 * V2 Section — Accordion với <details>/<summary>.
 * Header h-10 px-4 text-base (13px) font-medium zinc-900.
 * Content padding-16 border-t zinc-100.
 * Icon chevron 16px zinc-500 rotate khi open.
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
