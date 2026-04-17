"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";

export default function AdminSettingsPage() {
  const router = useRouter();

  const sha = (process.env.NEXT_PUBLIC_BUILD_SHA || "dev").slice(0, 7);
  const date = process.env.NEXT_PUBLIC_BUILD_DATE || "unknown";
  const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "v1.1.0-alpha";

  const handlePasswordChanged = async () => {
    // Force re-login sau khi đổi pass
    setTimeout(() => {
      void fetch("/api/auth/logout", { method: "POST" })
        .catch(() => {})
        .finally(() => {
          router.push("/login?reason=password-changed");
        });
    }, 1500);
  };

  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-zinc-500"
      >
        <Link href="/" className="hover:text-zinc-900">
          Tổng quan
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link href="/admin" className="hover:text-zinc-900">
          Quản trị
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-zinc-900">Cài đặt cá nhân</span>
      </nav>

      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Cài đặt cá nhân
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Quản lý mật khẩu, thông tin phiên đăng nhập.
        </p>
      </header>

      <div className="grid max-w-3xl gap-5">
        {/* Change password */}
        <section className="rounded-md border border-zinc-200 bg-white p-6">
          <header className="mb-4">
            <h2 className="text-sm font-semibold text-zinc-900">
              Đổi mật khẩu
            </h2>
            <p className="text-xs text-zinc-500">
              Sau khi đổi thành công, bạn sẽ được đăng xuất và yêu cầu đăng nhập
              lại với mật khẩu mới.
            </p>
          </header>
          <ChangePasswordForm onSuccess={handlePasswordChanged} />
        </section>

        {/* Build info */}
        <section className="rounded-md border border-zinc-200 bg-white p-6">
          <header className="mb-4">
            <h2 className="text-sm font-semibold text-zinc-900">
              Thông tin build
            </h2>
            <p className="text-xs text-zinc-500">
              Chi tiết phiên bản hệ thống đang chạy.
            </p>
          </header>
          <dl className="grid grid-cols-[120px,1fr] gap-y-2 text-xs">
            <dt className="uppercase tracking-wider text-zinc-500">Version</dt>
            <dd className="font-mono font-semibold text-zinc-900">{version}</dd>
            <dt className="uppercase tracking-wider text-zinc-500">Commit</dt>
            <dd className="font-mono text-zinc-900">{sha}</dd>
            <dt className="uppercase tracking-wider text-zinc-500">
              Build date
            </dt>
            <dd className="font-mono text-zinc-900">{date}</dd>
          </dl>
        </section>

        {/* Session info V1.2 stub */}
        <section className="rounded-md border border-zinc-200 bg-white p-6">
          <header className="mb-4">
            <h2 className="text-sm font-semibold text-zinc-900">
              Phiên đăng nhập
            </h2>
            <p className="text-xs text-zinc-500">
              Quản lý các phiên đang hoạt động (V1.2).
            </p>
          </header>
          <div className="space-y-3">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs">
              <p className="font-medium text-zinc-700">Phiên hiện tại</p>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                JWT HttpOnly cookie · {typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 60) : "—"}…
              </p>
            </div>
            <Button variant="outline" size="sm" disabled>
              Đăng xuất mọi thiết bị (V1.2)
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
