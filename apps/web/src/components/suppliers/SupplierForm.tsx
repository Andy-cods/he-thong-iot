"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  supplierCreateSchema,
  type SupplierCreate,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * V2 SupplierForm — kế thừa ItemForm V2 pattern (design-spec §3.6.1).
 *
 * - Wrapper max-w-[720px] padding 24 (p-6), border zinc-200 rounded-lg.
 * - Section spacing gap-6 (24px). 2 section: THÔNG TIN CƠ BẢN + LIÊN HỆ.
 * - Label uppercase 11px tracking-wider zinc-500 + required `*` red-500.
 * - Input h-9 (36px) font 13px default V2. Grid 2-col md gap-4.
 * - Helper text min-h-4 text-xs zinc-500 (error red-700) — reserve space.
 * - Submit primary blue-500 h-9 + Cancel ghost h-9.
 *
 * Props API GIỮ nguyên V1 để không break caller (SupplierFormProps).
 */

export interface SupplierFormProps {
  defaultValues?: Partial<SupplierCreate>;
  onSubmit: (data: SupplierCreate) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
}

export function SupplierForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: SupplierFormProps) {
  const {
    register,
    handleSubmit,
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
    },
  });

  const isEdit = Boolean(defaultValues?.code);

  return (
    <form
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      className="mx-auto w-full max-w-[720px] space-y-6 rounded-lg border border-zinc-200 bg-white p-6"
      noValidate
    >
      {/* Section 1 — Thông tin cơ bản */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Thông tin cơ bản
          </h2>
          <div className="h-px flex-1 bg-zinc-200" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            label="Mã NCC"
            htmlFor="code"
            required
            error={errors.code?.message}
          >
            <Input
              id="code"
              {...register("code")}
              error={!!errors.code}
              aria-describedby={errors.code ? "code-err" : undefined}
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
              aria-describedby={errors.name ? "name-err" : undefined}
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
        </div>
      </section>

      {/* Section 2 — Liên hệ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Liên hệ
          </h2>
          <div className="h-px flex-1 bg-zinc-200" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            label="Người liên hệ"
            htmlFor="contactName"
            error={errors.contactName?.message}
          >
            <Input id="contactName" {...register("contactName")} />
          </FormField>
          <FormField
            label="Điện thoại"
            htmlFor="phone"
            error={errors.phone?.message}
          >
            <Input
              id="phone"
              type="tel"
              {...register("phone")}
              className="tabular-nums"
              placeholder="VD: 0912345678"
            />
          </FormField>
          <FormField
            label="Email"
            htmlFor="email"
            error={errors.email?.message}
          >
            <Input
              id="email"
              type="email"
              {...register("email")}
              error={!!errors.email}
              placeholder="sales@vidu.vn"
            />
          </FormField>
        </div>

        <FormField
          label="Địa chỉ"
          htmlFor="address"
          error={errors.address?.message}
        >
          <Textarea
            id="address"
            rows={3}
            className="min-h-[72px]"
            {...register("address")}
          />
        </FormField>
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
