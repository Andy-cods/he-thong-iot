"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  FileText,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import { useUsersList } from "@/hooks/useAdmin";

/**
 * /admin index — quick links cards + build info.
 * 4 tiles compact 48px (reuse pattern Dashboard QuickLink):
 *   - Người dùng → /admin/users + count thật
 *   - Nhật ký hệ thống → /admin/audit
 *   - Cài đặt cá nhân → /admin/settings (change password)
 *   - Thông tin build (inline BUILD_SHA/DATE/VERSION)
 */
export default function AdminIndexPage() {
  const usersQuery = useUsersList({ page: 1, pageSize: 1 });
  const userCount = usersQuery.data?.meta.total ?? null;

  const sha = (process.env.NEXT_PUBLIC_BUILD_SHA || "dev").slice(0, 7);
  const date = process.env.NEXT_PUBLIC_BUILD_DATE || "";
  const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "v1.1.0-alpha";

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
        <span className="text-zinc-900">Quản trị</span>
      </nav>

      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Trang quản trị
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Quản lý người dùng, nhật ký hệ thống, và cài đặt cá nhân.
        </p>
      </header>

      <section
        aria-label="Quick links"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <QuickLink
          href="/admin/users"
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          title="Người dùng"
          description={
            userCount === null
              ? "Quản lý tài khoản & phân quyền"
              : `${userCount.toLocaleString("vi-VN")} tài khoản`
          }
        />
        <QuickLink
          href="/admin/audit"
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          title="Nhật ký hệ thống"
          description="Audit log CREATE/UPDATE/DELETE/LOGIN"
        />
        <QuickLink
          href="/admin/settings"
          icon={<SettingsIcon className="h-4 w-4" aria-hidden="true" />}
          title="Cài đặt cá nhân"
          description="Đổi mật khẩu, thông tin phiên"
        />
        <div className="group flex h-12 items-center gap-3 rounded-md border border-zinc-200 bg-white px-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-zinc-100 font-mono text-[10px] font-semibold text-zinc-600">
            BLD
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900">
              Thông tin build
            </p>
            <p className="truncate font-mono text-xs text-zinc-500">
              {version} · {sha}
              {date ? ` · ${date}` : ""}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-12 items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 transition-colors duration-150 hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">{title}</p>
        <p className="truncate text-xs text-zinc-500">{description}</p>
      </div>
    </Link>
  );
}
