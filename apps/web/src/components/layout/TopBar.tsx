"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Bell, Menu, Search } from "lucide-react";
import { Breadcrumb, useBreadcrumb } from "@/components/ui/breadcrumb";
import { UserMenu, type UserMenuUser } from "@/components/layout/UserMenu";
import { formatShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * V2 TopBar — Linear-inspired compact.
 * Desktop h-11 (44px) — giảm từ V1 56. Mobile h-14 (56px).
 * Logo nhỏ 20px mobile, breadcrumb inline desktop.
 * Ctrl+K trigger button ghost (text zinc-500 hover zinc-700).
 * Notification bell 28px icon 16px, badge red-500.
 * UserMenu right với avatar 24px.
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
        "sticky top-0 z-topbar flex h-14 md:h-11 items-center justify-between border-b border-zinc-200 bg-white px-4 xl:px-6",
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
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors duration-100 hover:bg-zinc-100 hover:text-zinc-900 md:hidden",
              "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2",
            )}
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        {/* Logo mobile thay breadcrumb */}
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-zinc-900 text-[9px] font-bold text-white md:hidden"
        >
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
          aria-keyshortcuts="Control+K"
          className={cn(
            "group inline-flex h-8 w-full items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-sm text-zinc-500 transition-colors duration-100 ease-out",
            "hover:border-zinc-300 hover:bg-white hover:text-zinc-700",
            "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2",
          )}
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="flex-1 text-left">Tìm kiếm và lệnh...</span>
          <kbd className="rounded-sm border border-zinc-200 bg-white px-1.5 py-0 font-mono text-[10px] text-zinc-500">
            {shortcutLabel}
          </kbd>
        </button>
      </div>

      {/* Right */}
      <div className="flex shrink-0 items-center gap-0.5">
        {/* Command trigger collapsed cho md-lg (icon only) */}
        <button
          type="button"
          onClick={onCommandOpen}
          aria-label={`Mở tìm kiếm và lệnh (${shortcutLabel})`}
          aria-keyshortcuts="Control+K"
          className={cn(
            "relative hidden h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition-colors duration-100 hover:bg-zinc-100 hover:text-zinc-900 md:inline-flex xl:hidden",
            "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2",
          )}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Thông báo · ${notificationCount} mới`}
          className={cn(
            "relative inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition-colors duration-100 hover:bg-zinc-100 hover:text-zinc-900",
            "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2",
          )}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {notificationCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums"
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
