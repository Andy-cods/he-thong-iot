"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { Breadcrumb, useBreadcrumb } from "@/components/ui/breadcrumb";
import { UserMenu, type UserMenuUser } from "@/components/layout/UserMenu";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { formatShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/nav-items";

/**
 * V3 TopBar — horizontal nav baked in.
 *
 * Layout (desktop):
 *   Row 1 (h-11): [Logo | Breadcrumb] ···· [Search Ctrl+K | Bell | User]
 *   Row 2 (h-10): [Nav items nằm ngang — icon + label]
 *
 * Mobile: chỉ Row 1 với hamburger, nav ẩn (dùng Sheet drawer).
 */

export interface TopBarProps {
  user: UserMenuUser;
  onLogout: () => void | Promise<void>;
  onSidebarToggle?: () => void;
  onCommandOpen?: () => void;
  notificationCount?: number;
  className?: string;
  /** V3 — nav items để render horizontal nav (desktop) */
  navItems?: NavItem[];
  pathname?: string;
  allHrefs?: string[];
}

function matchActive(pathname: string, href: string, allHrefs: string[] = []): boolean {
  if (href === "/") return pathname === "/";
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  for (const other of allHrefs) {
    if (other === href || other === "/") continue;
    if (other.startsWith(`${href}/`)) {
      if (pathname === other || pathname.startsWith(`${other}/`)) return false;
    }
  }
  return true;
}

export function TopBar({
  user,
  onLogout,
  onSidebarToggle,
  onCommandOpen,
  notificationCount = 0,
  className,
  navItems = [],
  pathname = "/",
  allHrefs = [],
}: TopBarProps) {
  const breadcrumbs = useBreadcrumb(pathname);
  const shortcutLabel = formatShortcut("Mod+K");

  return (
    <header
      role="banner"
      className={cn(
        "sticky top-0 z-topbar border-b border-zinc-200 bg-white shadow-sm",
        className,
      )}
    >
      {/* ── Row 1: Brand + utilities ── */}
      <div className="flex h-12 items-center justify-between px-4 xl:px-6">
        {/* Left */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Mobile hamburger */}
          {onSidebarToggle && (
            <button
              type="button"
              onClick={onSidebarToggle}
              aria-label="Mở menu"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors md:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
          )}

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-[11px] font-bold text-white shadow-sm">
              CN
            </div>
            <span className="hidden font-semibold text-zinc-900 sm:inline">Xưởng IoT</span>
          </Link>

          <div className="mx-1 hidden h-4 w-px bg-zinc-200 sm:block" />

          {/* Breadcrumb */}
          <div className="hidden min-w-0 md:block">
            <Breadcrumb items={breadcrumbs} />
          </div>
        </div>

        {/* Right — search + bell + user */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Search full (xl) */}
          <button
            type="button"
            onClick={onCommandOpen}
            aria-label={`Tìm kiếm và lệnh (${shortcutLabel})`}
            className="hidden h-8 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-500 hover:border-zinc-300 hover:bg-white hover:text-zinc-700 transition-colors xl:flex"
            style={{ minWidth: 200 }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="flex-1 text-left">Tìm kiếm và lệnh...</span>
            <kbd className="rounded border border-zinc-200 bg-white px-1.5 font-mono text-[10px] text-zinc-400">{shortcutLabel}</kbd>
          </button>

          {/* Search icon (md-xl) */}
          <button
            type="button"
            onClick={onCommandOpen}
            aria-label={`Tìm kiếm (${shortcutLabel})`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors xl:hidden"
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>

          {/* V3.3 Real notification bell với dropdown panel */}
          <NotificationBell />

          <UserMenu user={user} onLogout={onLogout} />
        </div>
      </div>

      {/* ── Row 2: Horizontal nav (desktop md+) ── */}
      {navItems.length > 0 && (
        <nav
          aria-label="Điều hướng chính"
          className="hidden md:flex items-center justify-center gap-1 border-t border-zinc-100 bg-white px-4 xl:px-6"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = matchActive(pathname, item.href, allHrefs);

            if (item.disabled) {
              return (
                <span
                  key={item.href}
                  className="relative flex items-center gap-2.5 px-4 py-3 text-[15px] font-medium text-zinc-300 cursor-not-allowed select-none"
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                  <span>{item.label}</span>
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2.5 px-4 py-3 text-[15px] font-medium transition-colors duration-150 whitespace-nowrap",
                  "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-t-full after:transition-all after:duration-150",
                  isActive
                    ? "text-indigo-600 after:bg-indigo-600"
                    : "text-zinc-600 hover:text-zinc-900 after:bg-transparent hover:after:bg-zinc-200",
                )}
              >
                <Icon
                  className={cn("h-[18px] w-[18px] shrink-0 transition-colors", isActive ? "text-indigo-600" : "text-zinc-400")}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-0.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
