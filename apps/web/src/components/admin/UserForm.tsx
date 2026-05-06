"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import type { Role } from "@iot/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * UserForm — reusable for create + edit.
 * `mode === "create"` → show username field. `edit` → readonly username + no password.
 *
 * Phase 2 redesign: card sections, label uppercase tracking-normal, inline
 * validation with AlertCircle icon, indigo accent.
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
  {
    code: "warehouse",
    label: "Warehouse",
    desc: "Kho — nhận hàng, tồn kho",
  },
  { code: "operator", label: "Operator", desc: "Gia công xưởng" },
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
      {mode === "create" ? (
        <Section
          title="Thông tin cá nhân"
          desc="Username chỉ chứa a-z 0-9 _.- và tối thiểu 3 ký tự."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldShell
              label="Username"
              required
              error={errors.username}
              htmlFor="user-username"
            >
              <TextInput
                id="user-username"
                value={value.username}
                onChange={(e) =>
                  onChange({ username: e.target.value.trim().toLowerCase() })
                }
                placeholder="vd: nguyenvana"
                disabled={disabled}
                invalid={!!errors.username}
                mono
              />
            </FieldShell>
            <FieldShell
              label="Họ và tên"
              required
              error={errors.fullName}
              htmlFor="user-fullName"
            >
              <TextInput
                id="user-fullName"
                value={value.fullName}
                onChange={(e) => onChange({ fullName: e.target.value })}
                placeholder="vd: Nguyễn Văn A"
                disabled={disabled}
                invalid={!!errors.fullName}
              />
            </FieldShell>
            <div className="md:col-span-2">
              <FieldShell
                label="Email"
                helper="Tuỳ chọn"
                error={errors.email}
                htmlFor="user-email"
              >
                <TextInput
                  id="user-email"
                  type="email"
                  value={value.email}
                  onChange={(e) => onChange({ email: e.target.value })}
                  placeholder="vd: a@songchau.vn"
                  disabled={disabled}
                  invalid={!!errors.email}
                />
              </FieldShell>
            </div>
          </div>
        </Section>
      ) : (
        <Section
          title="Thông tin cá nhân"
          desc="Username không thể đổi sau khi tạo."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldShell label="Username" htmlFor="user-username">
              <TextInput
                id="user-username"
                value={value.username}
                onChange={(e) =>
                  onChange({ username: e.target.value.trim().toLowerCase() })
                }
                disabled
                mono
              />
            </FieldShell>
            <FieldShell
              label="Họ và tên"
              required
              error={errors.fullName}
              htmlFor="user-fullName"
            >
              <TextInput
                id="user-fullName"
                value={value.fullName}
                onChange={(e) => onChange({ fullName: e.target.value })}
                disabled={disabled}
                invalid={!!errors.fullName}
              />
            </FieldShell>
            <div className="md:col-span-2">
              <FieldShell
                label="Email"
                helper="Tuỳ chọn"
                error={errors.email}
                htmlFor="user-email"
              >
                <TextInput
                  id="user-email"
                  type="email"
                  value={value.email}
                  onChange={(e) => onChange({ email: e.target.value })}
                  disabled={disabled}
                  invalid={!!errors.email}
                />
              </FieldShell>
            </div>
          </div>
        </Section>
      )}

      <Section
        title="Vai trò"
        desc="Chọn ít nhất 1 vai trò. User có thể có nhiều vai trò đồng thời."
      >
        <div className="space-y-2">
          {ALL_ROLES.map((r) => {
            const checked = value.roles.includes(r.code);
            return (
              <label
                key={r.code}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  checked
                    ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-100"
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
                    <span className="font-mono text-xs font-semibold uppercase tracking-normal text-zinc-900">
                      {r.code}
                    </span>
                    <span className="text-sm font-medium tracking-tight text-zinc-700">
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
          <p className="mt-2 flex items-center gap-1 text-[11px] text-rose-600">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            {errors.roles}
          </p>
        ) : null}
      </Section>
    </div>
  );
}

/* ----------------------------- Subcomponents ---------------------------- */

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900">
          {title}
        </h3>
        {desc ? <p className="mt-0.5 text-xs text-zinc-500">{desc}</p> : null}
      </header>
      {children}
    </section>
  );
}

function FieldShell({
  label,
  required,
  error,
  helper,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  helper?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-normal text-zinc-500"
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="text-rose-500">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-[11px] text-rose-600">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      ) : helper ? (
        <p className="text-[11px] text-zinc-500">{helper}</p>
      ) : null}
    </div>
  );
}

function TextInput({
  invalid,
  mono,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  mono?: boolean;
}) {
  return (
    <input
      {...rest}
      className={cn(
        "h-9 w-full rounded-md border bg-white px-3 text-sm tracking-normal text-zinc-900 outline-none transition-colors",
        "placeholder:text-zinc-400",
        "focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
        "disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500",
        mono && "font-mono",
        invalid
          ? "border-rose-400 ring-2 ring-rose-100"
          : "border-zinc-200",
        className,
      )}
    />
  );
}
