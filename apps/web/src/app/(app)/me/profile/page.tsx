"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Shield,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/useSession";
import { useUpdateProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";

/**
 * V3.7.66 — Trang Hồ sơ cá nhân (mọi role đã login).
 * Path: /me/profile
 *
 * Chức năng:
 *   - Hiển thị thông tin tài khoản (username, fullName, email, roles)
 *   - Cho phép edit fullName + email
 *   - Hiển thị role badges + helpful links sang Settings/Năng suất
 */

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, { label: string; tone: string }> = {
  admin: { label: "Quản trị", tone: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-800" },
  planner: { label: "Thiết kế", tone: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:ring-indigo-800" },
  operator: { label: "Gia công", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800" },
  warehouse: { label: "Kho", tone: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800" },
  purchaser: { label: "Thu mua", tone: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-800" },
};

export default function ProfilePage() {
  const session = useSession();
  const update = useUpdateProfile();

  const [editing, setEditing] = React.useState(false);
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [errors, setErrors] = React.useState<{ fullName?: string; email?: string }>({});

  // Sync state từ session khi load
  React.useEffect(() => {
    if (session.data) {
      setFullName(session.data.fullName);
      setEmail(session.data.email ?? "");
    }
  }, [session.data]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { fullName?: string; email?: string } = {};
    if (!fullName.trim()) errs.fullName = "Họ tên không được để trống";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = "Email không hợp lệ";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      await update.mutateAsync({
        fullName: fullName.trim(),
        email: email.trim() || null,
      });
      toast.success("Đã cập nhật hồ sơ");
      setEditing(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Cập nhật thất bại");
    }
  };

  const handleCancel = () => {
    if (session.data) {
      setFullName(session.data.fullName);
      setEmail(session.data.email ?? "");
    }
    setErrors({});
    setEditing(false);
  };

  const u = session.data;

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-50">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">Hồ sơ cá nhân</span>
        </nav>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Hồ sơ cá nhân
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          Xem và cập nhật thông tin tài khoản của bạn.
        </p>
      </header>

      <div className="mx-auto w-full max-w-3xl p-6">
        {session.isLoading ? (
          <ProfileSkeleton />
        ) : !u ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400">
            Không tải được thông tin tài khoản.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Hero card */}
            <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-4 bg-gradient-to-br from-indigo-50 to-violet-50/50 p-5 dark:from-indigo-950/40 dark:to-violet-950/30">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold uppercase text-white shadow-md">
                  {u.fullName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {u.fullName}
                  </h2>
                  <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">@{u.username}</p>
                  {u.roles.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {u.roles.map((r) => {
                        const meta = ROLE_LABELS[r] ?? {
                          label: r,
                          tone: "bg-zinc-50 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
                        };
                        return (
                          <span
                            key={r}
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                              meta.tone,
                            )}
                          >
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                {!editing ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(true)}
                    className="shrink-0"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Chỉnh sửa
                  </Button>
                ) : null}
              </div>
            </section>

            {/* Info form */}
            <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <header className="mb-4 flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Thông tin cá nhân
                </h3>
              </header>

              <form onSubmit={handleSave} className="space-y-4">
                <Field label="Username" helper="Username không thể đổi">
                  <Input
                    value={u.username}
                    disabled
                    className="bg-zinc-50 font-mono text-sm dark:bg-zinc-800"
                  />
                </Field>

                <Field
                  label="Họ và tên"
                  required
                  error={errors.fullName}
                >
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={!editing || update.isPending}
                    error={!!errors.fullName}
                    placeholder="VD: Nguyễn Văn A"
                    maxLength={255}
                  />
                </Field>

                <Field label="Email" error={errors.email} helper="Tuỳ chọn">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!editing || update.isPending}
                    error={!!errors.email}
                    placeholder="VD: ten@songchau.local"
                    maxLength={255}
                  />
                </Field>

                {editing ? (
                  <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleCancel}
                      disabled={update.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                      Huỷ
                    </Button>
                    <Button type="submit" disabled={update.isPending}>
                      {update.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Lưu thay đổi
                    </Button>
                  </div>
                ) : null}
              </form>
            </section>

            {/* Quick actions */}
            <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <QuickLink
                href="/me/settings"
                icon={<Lock className="h-4 w-4" />}
                title="Đổi mật khẩu"
                desc="Cập nhật mật khẩu định kỳ"
              />
              <QuickLink
                href="/me/productivity"
                icon={<Shield className="h-4 w-4" />}
                title="Năng suất của tôi"
                desc="Xem báo cáo cá nhân"
              />
              <LogoutCard />
            </section>
          </div>
        )}
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
      <label className="block text-[11px] font-semibold uppercase tracking-normal text-zinc-500 dark:text-zinc-400">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      ) : helper ? (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{helper}</p>
      ) : null}
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100 group-hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-900 dark:group-hover:bg-indigo-900/60">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{desc}</div>
      </div>
    </Link>
  );
}

function LogoutCard() {
  const [loading, setLoading] = React.useState(false);
  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      window.location.href = "/login";
    } catch {
      toast.error("Đăng xuất thất bại");
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={loading}
      className="group flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:border-rose-300 hover:shadow-md disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-rose-700"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 group-hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900 dark:group-hover:bg-rose-900/60">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {loading ? "Đang đăng xuất..." : "Đăng xuất"}
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Kết thúc phiên hiện tại</div>
      </div>
    </button>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Skeleton className="mb-4 h-4 w-40" />
        <div className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}
