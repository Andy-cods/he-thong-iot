"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { lineDimsText } from "@/lib/bom-grid/line-view";
import type { BomTreeNodeRaw } from "@/hooks/useBom";
import { LineCard } from "./LineCard";
import { MaterialCombobox, ProcessRouteBuilder } from "./RoutingPickers";
import {
  CATEGORY_OPTIONS,
  buildSpecRows,
  kindOfCategory,
  type FormErrors,
  type FormState,
} from "./model";

export interface LineSpecsCardProps {
  node: BomTreeNodeRaw;
  form: FormState;
  errors: FormErrors;
  editing: boolean;
  readOnly?: boolean;
  onEdit: () => void;
  onSubmit: (e: React.FormEvent) => void;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}

function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Card "Thông số kỹ thuật": xem dạng nhãn–giá trị; "Sửa" chuyển sang form inline. */
export function LineSpecsCard({
  node,
  form,
  errors,
  editing,
  readOnly,
  onEdit,
  onSubmit,
  setField,
}: LineSpecsCardProps) {
  const kind = kindOfCategory(form.category);
  const rows = buildSpecRows(node, lineDimsText(node));
  const num =
    (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setField(k, e.target.value as never);

  return (
    <LineCard
      title="Thông số kỹ thuật"
      action={
        !editing && !readOnly ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-indigo-600 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          >
            <Pencil className="h-3 w-3" aria-hidden /> Sửa
          </button>
        ) : null
      }
    >
      {!editing ? (
        rows.length === 0 ? (
          <p className="text-[12px] text-zinc-400 dark:text-zinc-500">
            Chưa có thông số. Bấm "Sửa" để bổ sung.
          </p>
        ) : (
          <dl className="divide-y divide-zinc-200/70 dark:divide-zinc-700/60">
            {rows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <dt className="shrink-0 text-[12px] text-zinc-500 dark:text-zinc-400">{r.label}</dt>
                <dd
                  className={cn(
                    "min-w-0 break-words text-right text-[13px] text-zinc-900 dark:text-zinc-50",
                    r.mono && "font-mono text-[12px]",
                  )}
                >
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        )
      ) : (
        <form id="line-sheet-form" onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label id="bls-cat-label">Loại linh kiện</Label>
            <div
              role="radiogroup"
              aria-labelledby="bls-cat-label"
              className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-zinc-200/60 p-1 dark:bg-zinc-700/50"
            >
              {CATEGORY_OPTIONS.map((o) => {
                const on = form.category === o.code;
                return (
                  <button
                    key={o.code}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setField("category", o.code)}
                    className={cn(
                      "h-8 rounded-lg px-1 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                      on
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                        : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="bls-qty" label="Hệ số (SL/bộ)" error={errors.qtyPerParent}>
              <Input
                id="bls-qty"
                type="number"
                step="0.001"
                min="0.01"
                value={form.qtyPerParent}
                onChange={num("qtyPerParent")}
                error={!!errors.qtyPerParent}
              />
            </Field>
            <Field id="bls-scrap" label="Hao hụt (%)" error={errors.scrapPercent}>
              <Input
                id="bls-scrap"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.scrapPercent}
                onChange={num("scrapPercent")}
                error={!!errors.scrapPercent}
              />
            </Field>
            <Field id="bls-uom" label="ĐVT" error={errors.uom}>
              <Input
                id="bls-uom"
                maxLength={16}
                value={form.uom}
                onChange={num("uom")}
                placeholder="cái, kg, m…"
                error={!!errors.uom}
              />
            </Field>
            {kind === "com" ? (
              <Field id="bls-supplier-pn" label="Mã NCC (part number)" error={errors.supplierPartNumber}>
                <Input
                  id="bls-supplier-pn"
                  maxLength={64}
                  value={form.supplierPartNumber}
                  onChange={num("supplierPartNumber")}
                  placeholder="Mã trên PO"
                  error={!!errors.supplierPartNumber}
                />
              </Field>
            ) : (
              <Field id="bls-blank" label="Quy cách (phôi)" error={errors.blankSize} hint="DxRxS (mm)">
                <Input
                  id="bls-blank"
                  maxLength={64}
                  value={form.blankSize}
                  onChange={num("blankSize")}
                  placeholder="100x50x20"
                  error={!!errors.blankSize}
                />
              </Field>
            )}
            <Field
              id="bls-desc"
              label="Vật liệu / Ghi chú"
              className="col-span-2"
              error={errors.description}
              hint={`${form.description.length}/500`}
            >
              <Textarea
                id="bls-desc"
                maxLength={500}
                rows={2}
                value={form.description}
                onChange={num("description")}
                error={!!errors.description}
              />
            </Field>
          </div>

          {kind === "com" ? (
            <div className="grid grid-cols-2 gap-3 border-t border-zinc-200/70 pt-3 dark:border-zinc-700/60">
              <Field id="bls-lead" label="Lead time (ngày)" error={errors.leadTimeDays}>
                <Input
                  id="bls-lead"
                  type="number"
                  min="0"
                  step="1"
                  value={form.leadTimeDays}
                  onChange={num("leadTimeDays")}
                  error={!!errors.leadTimeDays}
                />
              </Field>
              <Field id="bls-moq" label="MOQ" error={errors.moq}>
                <Input
                  id="bls-moq"
                  type="number"
                  min="1"
                  step="1"
                  value={form.moq}
                  onChange={num("moq")}
                  error={!!errors.moq}
                />
              </Field>
              <Field id="bls-price" label="Giá mua ước tính (₫)" error={errors.estimatedPrice}>
                <Input
                  id="bls-price"
                  type="number"
                  min="0"
                  step="1"
                  value={form.estimatedPrice}
                  onChange={num("estimatedPrice")}
                  error={!!errors.estimatedPrice}
                />
              </Field>
              <Field id="bls-payment" label="Thanh toán" error={errors.paymentTerms}>
                <Input
                  id="bls-payment"
                  maxLength={64}
                  value={form.paymentTerms}
                  onChange={num("paymentTerms")}
                  placeholder="NET 30 / COD"
                  error={!!errors.paymentTerms}
                />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 border-t border-zinc-200/70 pt-3 dark:border-zinc-700/60">
              <Field id="bls-material" label="Vật liệu gốc" className="col-span-2" error={errors.materialCode}>
                <MaterialCombobox
                  value={form.materialCode}
                  onChange={(code, name) => {
                    setField("materialCode", code);
                    setField("materialName", name);
                  }}
                />
              </Field>
              <div className="col-span-2 space-y-1.5">
                <Label>Quy trình gia công</Label>
                <ProcessRouteBuilder
                  selected={form.processRoute}
                  onAdd={(c) =>
                    !form.processRoute.includes(c) && setField("processRoute", [...form.processRoute, c])
                  }
                  onRemove={(c) =>
                    setField(
                      "processRoute",
                      form.processRoute.filter((x) => x !== c),
                    )
                  }
                  onMove={(c, dir) => {
                    const i = form.processRoute.indexOf(c);
                    const j = i + dir;
                    if (i < 0 || j < 0 || j >= form.processRoute.length) return;
                    const next = [...form.processRoute];
                    [next[i], next[j]] = [next[j]!, next[i]!];
                    setField("processRoute", next);
                  }}
                />
              </div>
              <Field id="bls-hours" label="Thời gian ước tính (giờ)" error={errors.estimatedHours}>
                <Input
                  id="bls-hours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.estimatedHours}
                  onChange={num("estimatedHours")}
                  error={!!errors.estimatedHours}
                />
              </Field>
              <Field
                id="bls-tech"
                label="Ghi chú kỹ thuật"
                className="col-span-2"
                error={errors.technicalNotes}
                hint={`${form.technicalNotes.length}/500`}
              >
                <Textarea
                  id="bls-tech"
                  maxLength={500}
                  rows={2}
                  value={form.technicalNotes}
                  onChange={num("technicalNotes")}
                  placeholder="Dung sai, bề mặt, xử lý nhiệt…"
                  error={!!errors.technicalNotes}
                />
              </Field>
            </div>
          )}
        </form>
      )}
    </LineCard>
  );
}
