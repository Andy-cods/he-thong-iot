"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import {
  supplierCreateSchema,
  type SupplierCreate,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * V1.9 P7 — SupplierForm extend: thêm section Địa chỉ, Ngân hàng, Điều khoản,
 * danh sách người liên hệ (dynamic array). Giữ interface cũ — caller chỉ cần
 * truyền thêm defaultValues.
 */

export interface SupplierFormProps {
  defaultValues?: Partial<SupplierCreate>;
  onSubmit: (data: SupplierCreate) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
}

const REGION_OPTIONS = [
  "Miền Bắc",
  "Miền Trung",
  "Miền Nam",
  "Tây Nguyên",
  "Nước ngoài",
];

export function SupplierForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: SupplierFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SupplierCreate>({
    resolver: zodResolver(supplierCreateSchema),
    defaultValues: {
      code: defaultValues?.code ?? "",
      name: defaultValues?.name ?? "",
      contactName: defaultValues?.contactName ?? null,
      phone: defaultValues?.phone ?? null,
      email: defaultValues?.email ?? null,
      address: defaultValues?.address ?? null,
      taxCode: defaultValues?.taxCode ?? null,
      region: defaultValues?.region ?? null,
      city: defaultValues?.city ?? null,
      ward: defaultValues?.ward ?? null,
      streetAddress: defaultValues?.streetAddress ?? null,
      factoryAddress: defaultValues?.factoryAddress ?? null,
      latitude: defaultValues?.latitude ?? null,
      longitude: defaultValues?.longitude ?? null,
      website: defaultValues?.website ?? null,
      bankInfo: defaultValues?.bankInfo ?? { name: null, account: null, branch: null },
      paymentTerms: defaultValues?.paymentTerms ?? null,
      contactPersons: defaultValues?.contactPersons ?? [],
      internalNotes: defaultValues?.internalNotes ?? null,
    },
  });

  const isEdit = Boolean(defaultValues?.code);

  const { fields, append, remove } = useFieldArray({
    control,
    name: "contactPersons",
  });

  return (
    <form
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      className="mx-auto w-full max-w-[860px] space-y-6 rounded-lg border border-zinc-200 bg-white p-6"
      noValidate
    >
      {/* Section 1 — Thông tin chung */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Thông tin chung
          </h2>
          <div className="h-px flex-1 bg-zinc-200" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="Mã NCC" htmlFor="code" required error={errors.code?.message}>
            <Input
              id="code"
              {...register("code")}
              error={!!errors.code}
              placeholder="VD: NCC-001"
              disabled={isEdit}
            />
          </FormField>
          <FormField
            label="Tên nhà cung cấp"
            htmlFor="name"
            required
            error={errors.name?.message}
          >
            <Input
              id="name"
              {...register("name")}
              error={!!errors.name}
              placeholder="VD: Công ty TNHH Thép Việt"
            />
          </FormField>
          <FormField
            label="Mã số thuế"
            htmlFor="taxCode"
            error={errors.taxCode?.message}
          >
            <Input
              id="taxCode"
              {...register("taxCode")}
              className="font-mono"
              placeholder="VD: 0123456789"
            />
          </FormField>
          <FormField label="Website" htmlFor="website" error={errors.website?.message}>
            <Input
              id="website"
              type="url"
              {...register("website")}
              placeholder="https://..."
            />
          </FormField>
        </div>
      </section>

      {/* Section 2 — Địa chỉ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Địa chỉ
          </h2>
          <div className="h-px flex-1 bg-zinc-200" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField label="Khu vực" htmlFor="region" error={errors.region?.message}>
            <select
              id="region"
              {...register("region")}
              className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— Chưa chọn —</option>
              {REGION_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Tỉnh / Thành phố" htmlFor="city" error={errors.city?.message}>
            <Input id="city" {...register("city")} placeholder="VD: TP. Hồ Chí Minh" />
          </FormField>
          <FormField label="Phường / Xã" htmlFor="ward" error={errors.ward?.message}>
            <Input id="ward" {...register("ward")} placeholder="VD: Phường Bình Trưng" />
          </FormField>
        </div>

        <FormField
          label="Địa chỉ đường / số nhà"
          htmlFor="streetAddress"
          error={errors.streetAddress?.message}
        >
          <Textarea id="streetAddress" rows={2} {...register("streetAddress")} />
        </FormField>

        <FormField
          label="Địa chỉ nhà máy (nếu khác văn phòng)"
          htmlFor="factoryAddress"
          error={errors.factoryAddress?.message}
        >
          <Textarea id="factoryAddress" rows={2} {...register("factoryAddress")} />
        </FormField>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="Vĩ độ (latitude)" htmlFor="latitude" error={errors.latitude?.message}>
            <Input
              id="latitude"
              type="number"
              step="any"
              {...register("latitude")}
              placeholder="10.762622"
              className="tabular-nums"
            />
          </FormField>
          <FormField label="Kinh độ (longitude)" htmlFor="longitude" error={errors.longitude?.message}>
            <Input
              id="longitude"
              type="number"
              step="any"
              {...register("longitude")}
              placeholder="106.660172"
              className="tabular-nums"
            />
          </FormField>
        </div>

        <FormField
          label="Địa chỉ (cũ - legacy)"
          htmlFor="address"
          error={errors.address?.message}
        >
          <Textarea
            id="address"
            rows={2}
            className="min-h-[56px]"
            {...register("address")}
            placeholder="Giữ tương thích — dùng các field ở trên nếu có thể"
          />
        </FormField>
      </section>

      {/* Section 3 — Liên hệ chính */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Liên hệ
          </h2>
          <div className="h-px flex-1 bg-zinc-200" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField
            label="Người liên hệ chính"
            htmlFor="contactName"
            error={errors.contactName?.message}
          >
            <Input id="contactName" {...register("contactName")} />
          </FormField>
          <FormField label="Điện thoại" htmlFor="phone" error={errors.phone?.message}>
            <Input
              id="phone"
              type="tel"
              {...register("phone")}
              className="tabular-nums"
              placeholder="VD: 0912345678"
            />
          </FormField>
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              {...register("email")}
              error={!!errors.email}
              placeholder="sales@vidu.vn"
            />
          </FormField>
        </div>

        {/* Người liên hệ bổ sung */}
        <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-600">
              Người liên hệ bổ sung ({fields.length})
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                append({ name: "", role: null, phone: null, email: null, notes: null })
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Thêm
            </Button>
          </div>

          {fields.length === 0 ? (
            <p className="text-xs text-zinc-500">Chưa có. Bấm "Thêm" để bổ sung.</p>
          ) : (
            <div className="space-y-3">
              {fields.map((f, idx) => (
                <div
                  key={f.id}
                  className="grid grid-cols-1 gap-2 rounded border border-zinc-200 bg-white p-3 md:grid-cols-[1fr_1fr_140px_1fr_auto]"
                >
                  <Input
                    {...register(`contactPersons.${idx}.name` as const)}
                    placeholder="Tên"
                    aria-label="Tên"
                  />
                  <Input
                    {...register(`contactPersons.${idx}.role` as const)}
                    placeholder="Chức vụ"
                    aria-label="Chức vụ"
                  />
                  <Input
                    {...register(`contactPersons.${idx}.phone` as const)}
                    placeholder="Điện thoại"
                    aria-label="Điện thoại"
                    className="tabular-nums"
                  />
                  <Input
                    {...register(`contactPersons.${idx}.email` as const)}
                    placeholder="Email"
                    type="email"
                    aria-label="Email"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(idx)}
                    aria-label={`Xoá liên hệ ${idx + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Section 4 — Ngân hàng & Điều khoản */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Ngân hàng & Điều khoản
          </h2>
          <div className="h-px flex-1 bg-zinc-200" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField label="Tên ngân hàng" htmlFor="bankName">
            <Input id="bankName" {...register("bankInfo.name")} placeholder="Vietcombank" />
          </FormField>
          <FormField label="Số tài khoản" htmlFor="bankAccount">
            <Input
              id="bankAccount"
              {...register("bankInfo.account")}
              className="tabular-nums font-mono"
              placeholder="0123456789"
            />
          </FormField>
          <FormField label="Chi nhánh" htmlFor="bankBranch">
            <Input id="bankBranch" {...register("bankInfo.branch")} placeholder="CN HCM" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            label="Điều khoản thanh toán"
            htmlFor="paymentTerms"
            error={errors.paymentTerms?.message}
          >
            <Input
              id="paymentTerms"
              {...register("paymentTerms")}
              placeholder="Net 30 / COD / Prepay"
            />
          </FormField>
          <FormField
            label="Ghi chú nội bộ"
            htmlFor="internalNotes"
            error={errors.internalNotes?.message}
          >
            <Textarea id="internalNotes" rows={2} {...register("internalNotes")} />
          </FormField>
        </div>
      </section>

      <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Huỷ
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Tạo nhà cung cấp"}
        </Button>
      </div>
    </form>
  );
}

function FormField({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} uppercase required={required} className="mb-1.5 block">
        {label}
      </Label>
      {children}
      <p
        id={error ? `${htmlFor}-err` : undefined}
        className={
          error
            ? "mt-1 min-h-4 text-xs text-red-700"
            : "mt-1 min-h-4 text-xs text-zinc-500"
        }
      >
        {error ?? ""}
      </p>
    </div>
  );
}
