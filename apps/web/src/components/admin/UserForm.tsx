"use client";

import * as React from "react";
import type { Role } from "@iot/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * UserForm — reusable for create + edit.
 * `mode === "create"` → show username field. `edit` → readonly username + no password.
 */
export interface UserFormState {
  username: string;
  fullName: string;
  email: string;
  roles: Role[];
  isActive: boolean;
}

export const ALL_ROLES: { code: Role; label: string; desc: string }[] = [
  { code: "admin", label: "Admin", desc: "Toàn quyền — quản trị user + audit" },
  { code: "planner", label: "Planner", desc: "Kế hoạch SX — BOM, Orders" },
  { code: "warehouse", label: "Warehouse", desc: "Kho — nhận hàng, tồn kho" },
  { code: "operator", label: "Operator", desc: "Vận hành xưởng" },
];

export interface UserFormProps {
  mode: "create" | "edit";
  value: UserFormState;
  onChange: (patch: Partial<UserFormState>) => void;
  errors?: Partial<Record<keyof UserFormState, string>>;
  disabled?: boolean;
}

export function UserForm({
  mode,
  value,
  onChange,
  errors = {},
  disabled,
}: UserFormProps) {
  const toggleRole = (r: Role) => {
    const next = value.roles.includes(r)
      ? value.roles.filter((x) => x !== r)
      : [...value.roles, r];
    onChange({ roles: next });
  };

  return (
    <div className="space-y-6">
      <section>
        <header className="mb-3">
          <h3 className="text-sm font-semibold text-zinc-900">Thông tin</h3>
          <p className="text-xs text-zinc-500">
            {mode === "create"
              ? "Username chỉ chứa a-z 0-9 _.- và tối thiểu 3 ký tự."
              : "Username không thể đổi sau khi tạo."}
          </p>
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="user-username" required uppercase>
              Username
            </Label>
            <Input
              id="user-username"
              value={value.username}
              onChange={(e) =>
                onChange({ username: e.target.value.trim().toLowerCase() })
              }
              placeholder="vd: nguyenvana"
              disabled={mode === "edit" || disabled}
              aria-invalid={errors.username ? true : undefined}
              className="font-mono"
            />
            {errors.username ? (
              <p className="text-xs text-red-600">{errors.username}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-fullName" required uppercase>
              Họ tên
            </Label>
            <Input
              id="user-fullName"
              value={value.fullName}
              onChange={(e) => onChange({ fullName: e.target.value })}
              placeholder="vd: Nguyễn Văn A"
              disabled={disabled}
              aria-invalid={errors.fullName ? true : undefined}
            />
            {errors.fullName ? (
              <p className="text-xs text-red-600">{errors.fullName}</p>
            ) : null}
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="user-email" uppercase>
              Email
            </Label>
            <Input
              id="user-email"
              type="email"
              value={value.email}
              onChange={(e) => onChange({ email: e.target.value })}
              placeholder="vd: a@songchau.vn"
              disabled={disabled}
              aria-invalid={errors.email ? true : undefined}
            />
            {errors.email ? (
              <p className="text-xs text-red-600">{errors.email}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section>
        <header className="mb-3">
          <h3 className="text-sm font-semibold text-zinc-900">Phân quyền</h3>
          <p className="text-xs text-zinc-500">
            Chọn ít nhất 1 vai trò. User có thể có nhiều vai trò.
          </p>
        </header>
        <div className="space-y-2">
          {ALL_ROLES.map((r) => {
            const checked = value.roles.includes(r.code);
            return (
              <label
                key={r.code}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                  checked
                    ? "border-blue-400 bg-blue-50"
                    : "border-zinc-200 bg-white hover:bg-zinc-50",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleRole(r.code)}
                  disabled={disabled}
                  aria-label={`Vai trò ${r.label}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold uppercase text-zinc-900">
                      {r.code}
                    </span>
                    <span className="text-sm font-medium text-zinc-700">
                      {r.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">{r.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
        {errors.roles ? (
          <p className="mt-2 text-xs text-red-600">{errors.roles}</p>
        ) : null}
      </section>
    </div>
  );
}
