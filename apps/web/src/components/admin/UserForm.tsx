"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
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
  /** V4.10 — xưởng (site) cho vai `workshop` (Sản lượng ca). */
  siteId?: string | null;
}

/**
 * V4.4 (NHÓM G, A15) — nhãn vai trò tiếng Việt thống nhất (trước đây 5/9 vai
 * trò hiện tên tiếng Anh "Admin, Planner, Warehouse, Operator, Purchaser"
 * cạnh 4 vai trò đã Việt hoá — nay dùng ĐÚNG nhãn `admin/users/page.tsx` đã
 * định nghĩa, nguồn DUY NHẤT cho toàn bộ danh sách + form user).
 */
export const ALL_ROLES: { code: Role; label: string; desc: string }[] = [
  { code: "admin", label: "Admin", desc: "Toàn quyền — quản trị user + audit" },
  { code: "planner", label: "Bộ phận Thiết kế", desc: "Kế hoạch SX — BOM, Orders" },
  {
    code: "warehouse",
    label: "Bộ phận Kho",
    desc: "Kho — nhận hàng, tồn kho",
  },
  { code: "operator", label: "Bộ phận Gia công", desc: "Gia công xưởng" },
  {
    code: "purchaser",
    label: "Bộ phận Thu mua",
    desc: "Thu mua — duyệt PR, tạo PO",
  },
  // V3.8 — Tổ QC/KCS: quản lý Bảng điều hành sản xuất (production board).
  { code: "qc", label: "Tổ QC / KCS", desc: "Kiểm tra chất lượng — Bảng sản xuất" },
  // V3.8.2 — Màn hình TV (kiosk): CHỈ xem bảng sản xuất, phiên 24h.
  {
    code: "display",
    label: "Màn hình TV",
    desc: "Chỉ xem Bảng sản xuất (kiosk) — phiên 24h",
  },
  // V3.9 — Bộ phận Kế toán: nhận YCVT đã duyệt, tải PDF/Excel.
  {
    code: "accountant",
    label: "Bộ phận Kế toán",
    desc: "Nhận phiếu đề xuất vật tư đã duyệt — tải PDF/Excel",
  },
  // V4.0 — Cổ đông: READ-ONLY Tài chính + tiến độ sản xuất.
  {
    code: "shareholder",
    label: "Cổ đông",
    desc: "Chỉ xem Tài chính (thu chi, công nợ) + tiến độ sản xuất",
  },
  // V4.10 — Xưởng vệ tinh: tài khoản CHUNG của xưởng gia công (vd Đông Anh).
  {
    code: "workshop",
    label: "Xưởng vệ tinh",
    desc: "Tài khoản chung của xưởng gia công — chỉ Sản lượng ca của xưởng được chọn, phiên 24h. Không kiêm vai trò khác.",
  },
];

/** Tra nhãn Việt hoá theo mã vai trò — dùng chung cho badge ở list/detail user. */
export const ROLE_LABELS: Record<Role, string> = Object.fromEntries(
  ALL_ROLES.map((r) => [r.code, r.label]),
) as Record<Role, string>;

/**
 * V4.4 (NHÓM G, DRY) — màu badge vai trò dùng chung (trước đây
 * `admin/users/page.tsx` và `admin/users/[id]/page.tsx` mỗi trang tự khai 1
 * bản `ROLE_BADGE` giống hệt nhau).
 */
export const ROLE_BADGE_CLASSES: Record<Role, string> = {
  admin: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-800",
  planner: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:ring-indigo-800",
  purchaser: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-800",
  warehouse: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800",
  operator: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  qc: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:ring-teal-800",
  display: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-800",
  accountant: "bg-lime-50 text-lime-700 ring-lime-200 dark:bg-lime-950/40 dark:text-lime-400 dark:ring-lime-800",
  shareholder: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-400 dark:ring-fuchsia-800",
  workshop: "bg-stone-100 text-stone-700 ring-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700",
};

interface SiteOption {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

/** V4.10 — danh sách xưởng cho ô chọn site của tài khoản xưởng. */
function useSiteOptions(enabled: boolean) {
  return useQuery<SiteOption[]>({
    queryKey: ["shift-output", "sites"],
    queryFn: async () => {
      const res = await fetch("/api/shift-output/sites", { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return ((await res.json()) as { data: SiteOption[] }).data;
    },
    enabled,
    staleTime: 60_000,
  });
}

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
    let next = value.roles.includes(r)
      ? value.roles.filter((x) => x !== r)
      : [...value.roles, r];
    // V4.10 — tài khoản xưởng KHÔNG kiêm vai khác: chọn workshop → chỉ còn
    // workshop; chọn vai khác khi đang là workshop → bỏ workshop.
    if (!value.roles.includes(r)) {
      next = r === "workshop" ? ["workshop"] : next.filter((x) => x !== "workshop");
    }
    onChange({ roles: next });
  };
  const isWorkshop = value.roles.includes("workshop");
  const sites = useSiteOptions(isWorkshop);

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
                    ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/40 dark:ring-indigo-800"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800/60",
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
                    <span className="font-mono text-xs font-semibold uppercase tracking-normal text-zinc-900 dark:text-zinc-50">
                      {r.code}
                    </span>
                    <span className="text-sm font-medium tracking-tight text-zinc-700 dark:text-zinc-300">
                      {r.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{r.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
        {errors.roles ? (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            {errors.roles}
          </p>
        ) : null}
        {isWorkshop ? (
          <div className="mt-4 max-w-sm">
            <FieldShell label="Xưởng" required error={errors.siteId} htmlFor="user-site">
              <select
                id="user-site"
                value={value.siteId ?? ""}
                onChange={(e) => onChange({ siteId: e.target.value || null })}
                disabled={disabled || sites.isLoading}
                className={cn(
                  "h-9 w-full rounded-md border bg-white px-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:bg-zinc-900 dark:text-zinc-50",
                  errors.siteId ? "border-rose-400" : "border-zinc-200 dark:border-zinc-700",
                )}
              >
                <option value="">{sites.isLoading ? "Đang tải…" : "— Chọn xưởng —"}</option>
                {(sites.data ?? [])
                  .filter((s) => s.isActive || s.id === value.siteId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
              </select>
            </FieldShell>
            {sites.isError ? (
              <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">Không tải được danh sách xưởng.</p>
            ) : null}
          </div>
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
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
        {desc ? <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{desc}</p> : null}
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
        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-normal text-zinc-500 dark:text-zinc-400"
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
        <p className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      ) : helper ? (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{helper}</p>
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
        "h-9 w-full rounded-md border bg-white px-3 text-sm tracking-normal text-zinc-900 outline-none transition-colors dark:bg-zinc-900 dark:text-zinc-50",
        "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
        "focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
        "disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400",
        mono && "font-mono",
        invalid
          ? "border-rose-400 ring-2 ring-rose-100"
          : "border-zinc-200 dark:border-zinc-700",
        className,
      )}
    />
  );
}
