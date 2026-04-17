"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Bell, Menu, Search } from "lucide-react";
import { Breadcrumb, useBreadcrumb } from "@/components/ui/breadcrumb";
import { UserMenu, type UserMenuUser } from "@/components/layout/UserMenu";
import { formatShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * Direction B — TopBar (design-spec §3.3).
 * - Height 56px (--topbar-height), bg-white border-b.
 * - Left: hamburger (mobile) + breadcrumb (desktop).
 * - Center (xl): CommandPalette trigger.
 * - Right: notification bell (stub) + UserMenu.
 */

export interface TopBarProps {
  user: UserMenuUser;
  onLogout: () => void | Promise<void>;
  onSidebarToggle?: () => void;
  onCommandOpen?: () => void;
  notificationCount?: number;
  className?: string;
}

export function TopBar({
  user,
  onLogout,
  onSidebarToggle,
  onCommandOpen,
  notificationCount = 0,
  className,
}: TopBarProps) {
  const pathname = usePathname();
  const breadcrumbs = useBreadcrumb(pathname ?? "/");
  const shortcutLabel = formatShortcut("Mod+K");

  return (
    <header
      role="banner"
      className={cn(
        "sticky top-0 z-topbar flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 xl:px-6",
        className,
      )}
    >
      {/* Left */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onSidebarToggle ? (
          <button
            type="button"
            onClick={onSidebarToggle}
            aria-label="Mở menu"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:shadow-focus md:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
        {/* Logo mobile thay breadcrumb trên mobile */}
        <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-slate-900 text-xs font-bold text-white md:hidden">
          CN
        </span>
        <div className="hidden min-w-0 md:block">
          <Breadcrumb items={breadcrumbs} />
        </div>
      </div>

      {/* Center — command palette trigger (xl only, ở giữa) */}
      <div className="mx-4 hidden max-w-md flex-1 xl:block">
        <button
          type="button"
          onClick={onCommandOpen}
          aria-label={`Mở tìm kiếm và lệnh (${shortcutLabel})`}
          className="group inline-flex h-9 w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 transition-colors hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:shadow-focus"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1 text-left">Tìm kiếm và lệnh...</span>
          <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-600">
            {shortcutLabel}
          </kbd>
        </button>
      </div>

      {/* Right */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Command trigger collapsed cho md-lg (icon only) */}
        <button
          type="button"
          onClick={onCommandOpen}
          aria-label={`Mở tìm kiếm và lệnh (${shortcutLabel})`}
          className="relative hidden h-10 w-10 items-center justify-center rounded text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:shadow-focus md:inline-flex xl:hidden"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Thông báo · ${notificationCount} mới`}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:shadow-focus"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {notificationCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
            >
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          ) : null}
        </button>
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
