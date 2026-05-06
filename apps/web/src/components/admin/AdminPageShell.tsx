"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  FileText,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AdminPageShell — wrapper layout cho toàn bộ /admin/* pages.
 *
 * Cấu trúc:
 *   1. Sticky top bar — breadcrumb + meta (build sha, version)
 *   2. Page header — title + description + optional actions slot
 *   3. Sub-nav tabs — chuyển nhanh giữa Dashboard / Users / Audit / Reports / Settings
 *   4. Main content slot (children)
 *
 * Mục tiêu:
 *   - Đồng bộ visual giữa 12 admin pages (header pattern, spacing, max-width).
 *   - Vietnamese-aware typography: tracking-tight cho heading, tracking-normal
 *     cho body (tránh tracking-wider gây vỡ font dấu).
 *   - Background gradient subtle indigo/zinc để admin "feel" khác với operator pages.
 */

export interface AdminBreadcrumbItem {
  label: string;
  href?: string;
}

export interface AdminPageShellProps {
  /** Breadcrumb path. Cuối cùng là trang hiện tại (không href). */
  breadcrumb: AdminBreadcrumbItem[];
  /** Page title (h1). */
  title: string;
  /** Sub-text dưới title. */
  description?: React.ReactNode;
  /** Các nút action (right-aligned trong header). VD: "Tạo user". */
  actions?: React.ReactNode;
  /** Hiện sub-nav tabs ở dưới header (mặc định: hiện). */
  showNav?: boolean;
  /** Footer meta nhỏ (build sha…). */
  meta?: React.ReactNode;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Match prefix (vd "/admin/users" match cả /admin/users/123). */
  matchPrefix: string;
  /** Match exact (chỉ root /admin). */
  exact?: boolean;
}> = [
  {
    href: "/admin",
    label: "Tổng quan",
    icon: ShieldCheck,
    matchPrefix: "/admin",
    exact: true,
  },
  {
    href: "/admin/users",
    label: "Người dùng",
    icon: Users,
    matchPrefix: "/admin/users",
  },
  {
    href: "/admin/audit",
    label: "Audit log",
    icon: FileText,
    matchPrefix: "/admin/audit",
  },
  {
    href: "/admin/reports/employee-productivity",
    label: "Báo cáo",
    icon: BarChart3,
    matchPrefix: "/admin/reports",
  },
  {
    href: "/admin/settings",
    label: "Cài đặt",
    icon: SettingsIcon,
    matchPrefix: "/admin/settings",
  },
];

export function AdminPageShell({
  breadcrumb,
  title,
  description,
  actions,
  showNav = true,
  meta,
  children,
}: AdminPageShellProps) {
  const pathname = usePathname() ?? "/admin";

  return (
    <div className="relative -mx-4 -my-4 md:-mx-6 md:-my-5">
      {/* Background gradient + subtle blob — full-bleed (đè lên padding của
          AppShell qua negative margin ở trên). */}
      <div className="relative bg-gradient-to-b from-zinc-50/60 via-white to-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden"
        >
          <div className="mx-auto h-full w-full max-w-6xl bg-[radial-gradient(60%_60%_at_20%_0%,rgba(99,102,241,0.08),transparent_70%),radial-gradient(40%_50%_at_80%_0%,rgba(16,185,129,0.06),transparent_70%)]" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-5 md:px-6 md:pt-6">
        {/* Top: breadcrumb + meta */}
        <div className="flex items-center justify-between gap-3">
          <Breadcrumb items={breadcrumb} />
          {meta ? (
            <div className="hidden font-mono text-[11px] tracking-normal text-zinc-500 sm:block">
              {meta}
            </div>
          ) : null}
        </div>

        {/* Page header */}
        <header className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold leading-tight tracking-tight text-zinc-900">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-600">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </header>

        {/* Sub-nav */}
        {showNav ? (
          <nav
            aria-label="Admin sections"
            className="mt-5 flex gap-1 overflow-x-auto border-b border-zinc-200 pb-px"
          >
            {NAV_ITEMS.map((item) => {
              const active = item.exact
                ? pathname === item.matchPrefix
                : pathname === item.matchPrefix ||
                  pathname.startsWith(item.matchPrefix + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "text-indigo-700"
                      : "text-zinc-600 hover:text-zinc-900",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      active
                        ? "text-indigo-600"
                        : "text-zinc-400 group-hover:text-zinc-500",
                    )}
                    aria-hidden="true"
                  />
                  {item.label}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-600"
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        ) : null}

        {/* Main content */}
        <main className="mt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Local breadcrumb (cho admin shell) ------------------- */

function Breadcrumb({ items }: { items: AdminBreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1 text-xs tracking-normal text-zinc-500"
    >
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1">
              {isLast || !item.href ? (
                <span
                  className={cn(
                    isLast ? "font-medium text-zinc-900" : "text-zinc-500",
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  {item.label}
                </Link>
              )}
              {!isLast ? (
                <ChevronRight
                  className="h-3 w-3 text-zinc-300"
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
