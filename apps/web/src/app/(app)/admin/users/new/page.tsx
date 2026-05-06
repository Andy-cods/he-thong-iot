"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { USERNAME_REGEX } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { UserForm, type UserFormState } from "@/components/admin/UserForm";
import {
  TempPasswordDisplay,
  generateTempPassword,
} from "@/components/admin/TempPasswordDisplay";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { useCreateUser } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

type Step = 1 | 2;

export default function AdminUsersNewPage() {
  const router = useRouter();
  const createUser = useCreateUser();

  const [step, setStep] = React.useState<Step>(1);
  const [form, setForm] = React.useState<UserFormState>({
    username: "",
    fullName: "",
    email: "",
    roles: ["operator"],
    isActive: true,
  });

  const [password, setPassword] = React.useState<string>(() =>
    generateTempPassword(12),
  );
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof UserFormState, string>>
  >({});

  const regenerate = () => setPassword(generateTempPassword(12));

  const validateStep1 = (): boolean => {
    const e: Partial<Record<keyof UserFormState, string>> = {};
    if (!form.username) e.username = "Username bắt buộc";
    else if (!USERNAME_REGEX.test(form.username))
      e.username =
        "Chỉ a-z, 0-9, _.- (bắt đầu bằng chữ/số), tối thiểu 3 ký tự";

    if (!form.fullName.trim()) e.fullName = "Họ tên bắt buộc";
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    )
      e.email = "Email không hợp lệ";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = (): boolean => {
    const e: Partial<Record<keyof UserFormState, string>> = { ...errors };
    delete e.roles;
    if (form.roles.length === 0) e.roles = "Phải chọn ít nhất 1 vai trò";
    setErrors(e);
    return !e.roles;
  };

  const handleNext = () => {
    if (validateStep1()) setStep(2);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validateStep2()) return;
    try {
      const res = await createUser.mutateAsync({
        username: form.username,
        fullName: form.fullName.trim(),
        email: form.email.trim() || undefined,
        password,
        roles: form.roles,
      });
      toast.success(
        `Tạo user ${res.data.username} thành công — mật khẩu tạm: ${password}`,
        { duration: 8000 },
      );
      router.push("/admin/users");
    } catch (err) {
      const e = err as { message?: string; code?: string };
      if (e.code === "USERNAME_DUPLICATE") {
        setErrors((prev) => ({
          ...prev,
          username: e.message ?? "Trùng username",
        }));
        setStep(1);
      } else {
        toast.error(e.message ?? "Tạo user thất bại");
      }
    }
  };

  return (
    <AdminPageShell
      breadcrumb={[
        { label: "Trang chủ", href: "/" },
        { label: "Quản trị", href: "/admin" },
        { label: "Người dùng", href: "/admin/users" },
        { label: "Tạo mới" },
      ]}
      title="Tạo người dùng mới"
      description="Mật khẩu tạm được sinh tự động — copy và gửi cho user để đổi sau lần đầu đăng nhập."
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {/* Step indicator */}
        <ol className="flex items-center gap-3">
          <StepDot
            n={1}
            label="Tài khoản"
            icon={<UserPlus className="h-3.5 w-3.5" />}
            active={step === 1}
            done={step > 1}
            onClick={() => setStep(1)}
          />
          <span className="h-px flex-1 bg-zinc-200" aria-hidden="true" />
          <StepDot
            n={2}
            label="Vai trò &amp; Mật khẩu"
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            active={step === 2}
            done={false}
          />
        </ol>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          {step === 1 ? (
            <>
              <header className="mb-5">
                <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
                  Bước 1 — Thông tin tài khoản
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Username là duy nhất, không thể đổi sau khi tạo.
                </p>
              </header>
              <UserFormStep1
                value={form}
                onChange={(p) => setForm((prev) => ({ ...prev, ...p }))}
                errors={errors}
                disabled={createUser.isPending}
              />
            </>
          ) : (
            <>
              <header className="mb-5">
                <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
                  Bước 2 — Vai trò &amp; Mật khẩu tạm
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Chọn ít nhất 1 vai trò. Mật khẩu tạm 12 ký tự sẽ được yêu cầu
                  đổi sau lần đăng nhập đầu tiên.
                </p>
              </header>

              {/* Reuse UserForm for roles section only; render via mode=create
                  but hide the info section by passing all fields readonly. We
                  inline a simpler roles picker for clarity. */}
              <UserForm
                mode="edit"
                value={form}
                onChange={(p) => setForm((prev) => ({ ...prev, ...p }))}
                errors={errors}
                disabled={createUser.isPending}
              />

              <section className="mt-6 border-t border-zinc-200 pt-5">
                <header className="mb-3">
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-900">
                    Mật khẩu tạm
                  </h3>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    12 ký tự random — copy gửi cho user, hệ thống sẽ ép đổi lần
                    đầu.
                  </p>
                </header>
                <div className="flex items-center gap-2">
                  <TempPasswordDisplay
                    value={password}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={regenerate}
                    aria-label="Sinh lại mật khẩu"
                  >
                    <RefreshCw
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                  </Button>
                </div>
              </section>
            </>
          )}

          <div className="mt-6 flex items-center justify-between gap-2 border-t border-zinc-200 pt-4">
            {step === 1 ? (
              <Button asChild variant="ghost" size="sm" type="button">
                <Link href="/admin/users">← Quay lại danh sách</Link>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setStep(1)}
              >
                ← Quay lại bước 1
              </Button>
            )}
            {step === 1 ? (
              <Button
                type="button"
                size="sm"
                onClick={handleNext}
                disabled={createUser.isPending}
              >
                Tiếp tục →
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={createUser.isPending}
              >
                {createUser.isPending ? "Đang tạo…" : "Tạo user"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </AdminPageShell>
  );
}

function StepDot({
  n,
  label,
  icon,
  active,
  done,
  onClick,
}: {
  n: number;
  label: React.ReactNode;
  icon: React.ReactNode;
  active: boolean;
  done: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick) && !active;
  const Component: React.ElementType = interactive ? "button" : "div";
  return (
    <Component
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2",
        interactive && "cursor-pointer hover:opacity-80",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-2",
          active
            ? "bg-indigo-600 text-white ring-indigo-200"
            : done
              ? "bg-emerald-500 text-white ring-emerald-200"
              : "bg-zinc-100 text-zinc-500 ring-zinc-200",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : n}
      </span>
      <span
        className={cn(
          "flex items-center gap-1 text-xs font-medium tracking-tight",
          active
            ? "text-zinc-900"
            : done
              ? "text-emerald-700"
              : "text-zinc-500",
        )}
      >
        {icon}
        {label}
      </span>
    </Component>
  );
}

/* Step 1 — minimal form (username/fullName/email only) so step UI is clean. */
function UserFormStep1({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: UserFormState;
  onChange: (p: Partial<UserFormState>) => void;
  errors: Partial<Record<keyof UserFormState, string>>;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field
        label="Username"
        required
        error={errors.username}
        helper="Chỉ a-z, 0-9, _.- · tối thiểu 3 ký tự"
      >
        <input
          id="user-username"
          value={value.username}
          onChange={(e) =>
            onChange({ username: e.target.value.trim().toLowerCase() })
          }
          placeholder="vd: nguyenvana"
          disabled={disabled}
          aria-invalid={errors.username ? true : undefined}
          className={cn(
            "h-9 w-full rounded-md border bg-white px-3 font-mono text-sm tracking-normal text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
            errors.username
              ? "border-rose-400 ring-2 ring-rose-100"
              : "border-zinc-200",
            disabled && "cursor-not-allowed opacity-60",
          )}
        />
      </Field>
      <Field
        label="Họ và tên"
        required
        error={errors.fullName}
      >
        <input
          id="user-fullName"
          value={value.fullName}
          onChange={(e) => onChange({ fullName: e.target.value })}
          placeholder="vd: Nguyễn Văn A"
          disabled={disabled}
          aria-invalid={errors.fullName ? true : undefined}
          className={cn(
            "h-9 w-full rounded-md border bg-white px-3 text-sm tracking-normal text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
            errors.fullName
              ? "border-rose-400 ring-2 ring-rose-100"
              : "border-zinc-200",
            disabled && "cursor-not-allowed opacity-60",
          )}
        />
      </Field>
      <div className="md:col-span-2">
        <Field label="Email" error={errors.email} helper="Tuỳ chọn">
          <input
            id="user-email"
            type="email"
            value={value.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="vd: a@songchau.vn"
            disabled={disabled}
            aria-invalid={errors.email ? true : undefined}
            className={cn(
              "h-9 w-full rounded-md border bg-white px-3 text-sm tracking-normal text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
              errors.email
                ? "border-rose-400 ring-2 ring-rose-100"
                : "border-zinc-200",
              disabled && "cursor-not-allowed opacity-60",
            )}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-normal text-zinc-500">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-rose-500">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-rose-600">{error}</p>
      ) : helper ? (
        <p className="text-[11px] text-zinc-500">{helper}</p>
      ) : null}
    </div>
  );
}
