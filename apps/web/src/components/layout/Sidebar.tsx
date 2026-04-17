"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Role } from "@iot/shared";
import { cn } from "@/lib/utils";
import { storage, STORAGE_KEYS } from "@/lib/storage";
import { NAV_ITEMS, type NavItem } from "@/lib/nav-items";

/**
 * Direction B — Sidebar (design-spec §3.2).
 * - Expanded 240 / collapsed 56 px, transition width 320ms ease-industrial.
 * - Active item: bg-slate-100 + border-l-2 border-cta.
 * - Collapsed: icon-only + tooltip (Radix title native cho V1 đơn giản).
 * - Persist localStorage `iot:sidebar-collapsed`, SSR-safe (initial prop).
 *
 * Nav items lấy từ `@/lib/nav-items` (single-source-of-truth với
 * CommandPalette + breadcrumb). Prop `navItems` override cho test/story.
 */
export type { Role, NavItem };

const DEFAULT_NAV: NavItem[] = NAV_ITEMS;

export interface SidebarProps {
  defaultCollapsed?: boolean;
  userRole?: Role;
  navItems?: NavItem[];
  className?: string;
}

export function Sidebar({
  defaultCollapsed = false,
  userRole,
  navItems = DEFAULT_NAV,
  className,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  // Rehydrate từ localStorage sau mount — tránh mismatch SSR.
  React.useEffect(() => {
    const persisted = storage.get<boolean | null>(
      STORAGE_KEYS.sidebarCollapsed,
      null,
    );
    if (persisted !== null && persisted !== defaultCollapsed) {
      setCollapsed(persisted);
    }
    // chỉ đọc 1 lần khi mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      storage.set(STORAGE_KEYS.sidebarCollapsed, next);
      return next;
    });
  }, []);

  // Filter theo role (role bỏ qua nếu không định nghĩa roles).
  const items = React.useMemo(() => {
    if (!userRole) return navItems;
    return navItems.filter((it) => !it.roles || it.roles.includes(userRole));
  }, [navItems, userRole]);

  return (
    <aside
      aria-label="Điều hướng chính"
      data-collapsed={collapsed}
      className={cn(
        "relative z-sidebar flex h-full shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-slow ease-industrial",
        collapsed ? "w-14" : "w-60",
        className,
      )}
      style={{
        // Expose cho grid parent dùng --sidebar-width nếu cần
        ["--sidebar-current-width" as string]: collapsed ? "3.5rem" : "15rem",
      }}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-slate-200",
          collapsed ? "justify-center px-0" : "px-3",
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-900 text-xs font-bold text-white">
          CN
        </div>
        {collapsed ? null : (
          <span className="ml-2 truncate text-sm font-semibold text-slate-900">
            Xưởng IoT
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2" aria-label="Menu">
        <ul className="flex flex-col gap-0.5">
          {items.map((item, idx) => (
            <SidebarItem
              key={`${item.href}-${idx}`}
              item={item}
              pathname={pathname ?? "/"}
              collapsed={collapsed}
            />
          ))}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-slate-200 p-2">
        <button
          type="button"
          onClick={handleToggle}
          aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          aria-pressed={collapsed}
          className={cn(
            "inline-flex h-10 w-full items-center gap-2 rounded px-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900",
            "focus:outline-none focus-visible:shadow-focus",
            collapsed ? "justify-center" : "justify-start",
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              <span>Thu gọn</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function SidebarItem({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const isActive = matchActive(pathname, item.href);

  const content = (
    <>
      <Icon
        className={cn(
          "h-5 w-5 shrink-0 transition-colors",
          isActive ? "text-slate-900" : "text-slate-500",
        )}
        aria-hidden="true"
      />
      {collapsed ? null : (
        <span className="flex-1 truncate">{item.label}</span>
      )}
      {!collapsed && item.badge !== undefined ? (
        <span className="ml-auto inline-flex h-5 items-center rounded-full bg-slate-100 px-2 text-xs font-medium text-slate-600">
          {item.badge}
        </span>
      ) : null}
    </>
  );

  const baseClass = cn(
    "relative mx-2 flex h-10 items-center gap-2 rounded px-3 text-sm transition-colors",
    "focus:outline-none focus-visible:shadow-focus",
    collapsed && "justify-center px-0",
    isActive
      ? "bg-slate-100 text-slate-900 font-medium before:absolute before:left-0 before:top-1 before:h-8 before:w-0.5 before:rounded-r before:bg-cta"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
    item.disabled && "cursor-not-allowed text-slate-400 hover:bg-transparent",
  );

  return (
    <li>
      {item.divider ? (
        <div aria-hidden="true" className="mx-3 my-2 h-px bg-slate-200" />
      ) : null}
      {item.disabled ? (
        <span
          aria-disabled="true"
          tabIndex={-1}
          title={collapsed ? `${item.label} (V1.1)` : undefined}
          className={baseClass}
        >
          {content}
        </span>
      ) : (
        <Link
          href={item.href}
          aria-current={isActive ? "page" : undefined}
          title={collapsed ? item.label : undefined}
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
