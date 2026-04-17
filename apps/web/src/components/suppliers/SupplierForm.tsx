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
 * SupplierForm — reuse pattern của ItemForm.
 * Mode: create (V1). Edit xử lý qua detail page inline.
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

  return (
    <form
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
      noValidate
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="code" required>
            Mã NCC
          </Label>
          <Input
            id="code"
            {...register("code")}
            aria-invalid={!!errors.code}
            aria-describedby={errors.code ? "code-err" : undefined}
            placeholder="VD: NCC-001"
          />
          {errors.code ? (
            <p id="code-err" className="mt-1 text-xs text-danger-strong">
              {errors.code.message}
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="name" required>
            Tên nhà cung cấp
          </Label>
          <Input
            id="name"
            {...register("name")}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-err" : undefined}
            placeholder="VD: Công ty TNHH Thép Việt"
          />
          {errors.name ? (
            <p id="name-err" className="mt-1 text-xs text-danger-strong">
              {errors.name.message}
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="contactName">Người liên hệ</Label>
          <Input id="contactName" {...register("contactName")} />
        </div>
        <div>
          <Label htmlFor="phone">Điện thoại</Label>
          <Input
            id="phone"
            type="tel"
            {...register("phone")}
            placeholder="VD: 0912345678"
          />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            {...register("email")}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-err" : undefined}
          />
          {errors.email ? (
            <p id="email-err" className="mt-1 text-xs text-danger-strong">
              {errors.email.message}
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="taxCode">Mã số thuế</Label>
          <Input id="taxCode" {...register("taxCode")} />
        </div>
      </div>
      <div>
        <Label htmlFor="address">Địa chỉ</Label>
        <Textarea id="address" rows={2} {...register("address")} />
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Huỷ
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Đang lưu…" : "Lưu"}
        </Button>
      </div>
    </form>
  );
}
