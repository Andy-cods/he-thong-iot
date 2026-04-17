"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@iot/shared";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, type NavItem } from "@/lib/nav-items";

/**
 * V2 Sidebar — Linear-inspired FIXED 220px (bỏ collapsible V1).
 * Logo area h-12 (48px) — giảm từ V1 56. Nav item h-7 (28px), icon 16px,
 * font 13px, padding-x 12px. Active: bg-blue-50 text-blue-700 +
 * border-l-2 border-blue-500 (thay orange V1). Hover bg-zinc-100.
 * Mobile: 280px slide-in drawer (render bởi AppShell Sheet wrapper).
 */
export type { Role, NavItem };

const DEFAULT_NAV: NavItem[] = NAV_ITEMS;

export interface SidebarProps {
  userRole?: Role;
  navItems?: NavItem[];
  className?: string;
}

export function Sidebar({
  userRole,
  navItems = DEFAULT_NAV,
  className,
}: SidebarProps) {
  const pathname = usePathname();

  // Filter theo role (role bỏ qua nếu không định nghĩa roles).
  const items = React.useMemo(() => {
    if (!userRole) return navItems;
    return navItems.filter((it) => !it.roles || it.roles.includes(userRole));
  }, [navItems, userRole]);

  return (
    <aside
      aria-label="Điều hướng chính"
      className={cn(
        "relative z-sidebar flex h-full w-[220px] shrink-0 flex-col border-r border-zinc-200 bg-white",
        className,
      )}
      style={{
        ["--sidebar-current-width" as string]: "13.75rem",
      }}
    >
      {/* Brand header 48px */}
      <div className="flex h-12 items-center border-b border-zinc-100 px-4">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-zinc-900 text-[10px] font-bold text-white">
          CN
        </div>
        <span className="ml-2 truncate text-base font-semibold text-zinc-900">
          Xưởng IoT
        </span>
      </div>

      {/* Nav */}
      <nav
        className="flex-1 overflow-y-auto py-2"
        aria-label="Menu"
      >
        <ul className="flex flex-col gap-0.5 px-2">
          {items.map((item, idx) => (
            <SidebarItem
              key={`${item.href}-${idx}`}
              item={item}
              pathname={pathname ?? "/"}
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function SidebarItem({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const isActive = matchActive(pathname, item.href);

  const content = (
    <>
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors duration-100",
          isActive ? "text-blue-600" : "text-zinc-500",
        )}
        aria-hidden="true"
        strokeWidth={1.75}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined ? (
        <span className="ml-auto inline-flex h-[18px] items-center rounded-sm bg-zinc-100 px-1.5 text-[10px] font-medium text-zinc-600">
          {item.badge}
        </span>
      ) : null}
    </>
  );

  const baseClass = cn(
    "relative flex h-7 items-center gap-2 rounded-md px-3 text-base font-medium transition-colors duration-100 ease-out",
    "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]",
    isActive
      ? // V2 active: bg-blue-50 tint + border-l-2 blue-500 (padding-l bù 2px = [10px])
        "bg-blue-50 text-blue-700 pl-[10px] before:absolute before:left-0 before:top-1 before:h-5 before:w-0.5 before:rounded-r before:bg-blue-500"
      : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900",
    item.disabled && "cursor-not-allowed text-zinc-400 hover:bg-transparent",
  );

  return (
    <li>
      {item.divider ? (
        <div
          aria-hidden="true"
          className="my-1.5 h-px bg-zinc-100"
        />
      ) : null}
      {item.disabled ? (
        <span
          aria-disabled="true"
          tabIndex={-1}
          className={baseClass}
        >
          {content}
        </span>
      ) : (
        <Link
          href={item.href}
          aria-current={isActive ? "page" : undefined}
          className={baseClass}
        >
          {content}
        </Link>
      )}
    </li>
  );
}

/** Active matching: `/items` active khi pathname `/items`, `/items/...`. Root `/` chỉ exact match. */
function matchActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
