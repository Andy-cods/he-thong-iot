"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Bell,
  Globe,
  Laptop,
  Lock,
  LogOut,
  Smartphone,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";
import { ThemeSegmented } from "@/components/theme/ThemeToggle";
import { useSession } from "@/hooks/useSession";
import { useMySessions, useRevokeSession } from "@/hooks/useSessions";
import { cn } from "@/lib/utils";

/**
 * V3.7.66 — Trang Cài đặt cá nhân (mọi role đã login).
 * Path: /me/settings
 *
 * Section:
 *   - Đổi mật khẩu (re-use ChangePasswordForm)
 *   - Phiên đăng nhập của tôi (list active sessions + revoke)
 *   - (V2) notification preferences, theme — placeholder
 */

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const session = useSession();
  const u = session.data;

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-50">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">Cài đặt</span>
        </nav>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Cài đặt cá nhân
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          Quản lý mật khẩu, phiên đăng nhập và tuỳ chọn của bạn.
        </p>
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
        {/* Bảo mật — Đổi mật khẩu */}
        <SectionCard
          icon={<Lock className="h-4 w-4 text-rose-600" />}
          title="Bảo mật · Đổi mật khẩu"
          description="Cập nhật mật khẩu định kỳ để bảo vệ tài khoản. Yêu cầu nhập mật khẩu hiện tại."
        >
          <ChangePasswordForm
            onSuccess={() => toast.success("Đã đổi mật khẩu thành công")}
          />
        </SectionCard>

        {/* Sessions */}
        <SectionCard
          icon={<Globe className="h-4 w-4 text-indigo-600" />}
          title="Phiên đăng nhập"
          description="Danh sách thiết bị đang đăng nhập tài khoản của bạn. Đăng xuất các phiên không nhận diện."
        >
          {u ? <SessionsList /> : <Skeleton className="h-20 w-full" />}
        </SectionCard>

        {/* Tuỳ chọn cá nhân — placeholder V2 */}
        <SectionCard
          icon={<Bell className="h-4 w-4 text-amber-600" />}
          title="Tuỳ chọn cá nhân"
          description="Thông báo, ngôn ngữ, theme — sẽ bổ sung ở phiên bản tiếp theo."
        >
          <div className="space-y-2">
            <PreferenceRow
              label="Thông báo trong app"
              hint="Bật/tắt notification realtime"
              disabled
            />
            <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/40 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div>
                <div className="text-sm font-medium tracking-tight text-zinc-800 dark:text-zinc-200">
                  Giao diện
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Sáng / Tối / Theo hệ thống
                </div>
              </div>
              <ThemeSegmented />
            </div>
            <PreferenceRow
              label="Ngôn ngữ"
              hint="Tiếng Việt (mặc định)"
              disabled
            />
          </div>
        </SectionCard>

        {/* Quick actions */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link
            href="/me/profile"
            className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-900">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Hồ sơ cá nhân
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Cập nhật họ tên, email
              </div>
            </div>
          </Link>
          <LogoutCard />
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Sections                                                    */
/* ─────────────────────────────────────────────────────────── */

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-4 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-50 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </h3>
          <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function PreferenceRow({
  label,
  hint,
  disabled,
}: {
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/40 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/40",
        disabled && "opacity-60",
      )}
    >
      <div>
        <div className="text-sm font-medium tracking-tight text-zinc-800 dark:text-zinc-200">
          {label}
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</div>
      </div>
      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        V1.1
      </span>
    </div>
  );
}

function SessionsList() {
  const sessionsQuery = useMySessions();
  const revoke = useRevokeSession();
  const sessions = sessionsQuery.data?.data ?? [];

  if (sessionsQuery.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (sessions.length === 0) {
    return (
      <p className="text-xs italic text-zinc-500 dark:text-zinc-400">
        Không có phiên active. Bạn đang dùng cookie session.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
      {sessions.map((s) => {
        const isMobile = /mobi|android|iphone|ipad/i.test(s.userAgent ?? "");
        const isCurrent = s.isCurrent ?? false;
        return (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 text-[12px]",
              isCurrent && "bg-indigo-50/40 dark:bg-indigo-950/30",
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                isCurrent
                  ? "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-800"
                  : "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
              )}
            >
              {isMobile ? (
                <Smartphone className="h-4 w-4" />
              ) : (
                <Laptop className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-800 dark:text-zinc-100">
                  {isMobile ? "Mobile" : "Desktop"}
                </span>
                {isCurrent ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-normal text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Phiên này
                  </span>
                ) : null}
              </div>
              <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                {s.ipAddress ?? "—"}
                {s.userAgent ? ` · ${s.userAgent.slice(0, 60)}` : ""}
              </div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                Bắt đầu: {new Date(s.issuedAt).toLocaleString("vi-VN")}
              </div>
            </div>
            {!isCurrent ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm("Đăng xuất phiên này?")) {
                    void revoke.mutateAsync(s.id).then(() => {
                      toast.success("Đã đăng xuất phiên");
                    });
                  }
                }}
                disabled={revoke.isPending}
                className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                aria-label="Đăng xuất phiên"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
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
      className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:border-rose-300 hover:shadow-md disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-rose-700"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900">
        <LogOut className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {loading ? "Đang đăng xuất..." : "Đăng xuất phiên này"}
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Kết thúc phiên hiện tại
        </div>
      </div>
    </button>
  );
}
