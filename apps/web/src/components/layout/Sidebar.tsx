"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@iot/shared";
import { cn } from "@/lib/utils";
import {
  NAV_ITEMS,
  groupNavBySection,
  type NavItem,
} from "@/lib/nav-items";

/**
 * V1.8 Sidebar — Linear-inspired FIXED 220px.
 *
 * Thay đổi so với V1.7:
 *   - Group nav theo 3 section (Sản xuất / Kho & Mua sắm / Khác) — label
 *     uppercase 10px zinc-400, padding-x 12px, margin-top 10px.
 *   - Active state rõ hơn: border-left 2px indigo-500 + bg-indigo-50/60 +
 *     text-indigo-700 + icon indigo-600. Hover smooth transition 150ms.
 *   - Gap nhỏ hơn giữa item (gap-px) để gọn hơn.
 *
 * Logo area h-12 (48px). Nav item h-7 (28px), icon 16px, font 13px, padding-x 12px.
 * Mobile: 280px slide-in drawer (render bởi AppShell Sheet wrapper).
 */
export type { Role, NavItem };

const DEFAULT_NAV: NavItem[] = NAV_ITEMS;

export interface SidebarProps {
  userRole?: Role;
  navItems?: NavItem[];
  className?: string;
  /**
   * V1.6 — variant hiển thị.
   * - `full` (default): width 220px, icon + label + badge.
   * - `icon-only`: width 56px, chỉ icon + tooltip native (title attr).
   *   Dùng khi AppShell detect workspace context (BOM/...) → không gian cho
   *   ContextualSidebar 220px bên cạnh.
   */
  variant?: "full" | "icon-only";
}

export function Sidebar({
  userRole,
  navItems = DEFAULT_NAV,
  className,
  variant = "full",
}: SidebarProps) {
  const pathname = usePathname();

  // Filter theo role (role bỏ qua nếu không định nghĩa roles).
  const items = React.useMemo(() => {
    if (!userRole) return navItems;
    return navItems.filter((it) => !it.roles || it.roles.includes(userRole));
  }, [navItems, userRole]);

  /**
   * Tập hợp href của các item hiện hữu — dùng để loại trừ trường hợp
   * parent "/bom" bị match khi user đang ở nested "/bom/import" (bản thân
   * "/bom/import" đã là item riêng). Nếu không có guard này, cả 2 item sáng.
   */
  const allHrefs = React.useMemo(
    () => items.map((it) => it.href),
    [items],
  );

  const isIconOnly = variant === "icon-only";

  // V1.8 — group theo section (chỉ áp dụng cho variant full).
  const groups = React.useMemo(
    () => (isIconOnly ? null : groupNavBySection(items)),
    [items, isIconOnly],
  );

  return (
    <aside
      aria-label="Điều hướng chính"
      className={cn(
        "relative z-sidebar flex h-full shrink-0 flex-col border-r border-zinc-200 bg-white transition-[width] duration-150 ease-out",
        isIconOnly ? "w-14" : "w-[220px]",
        className,
      )}
      style={{
        ["--sidebar-current-width" as string]: isIconOnly ? "3.5rem" : "13.75rem",
      }}
    >
      {/* Brand header 48px */}
      <div
        className={cn(
          "flex h-12 items-center border-b border-zinc-100",
          isIconOnly ? "justify-center px-0" : "px-4",
        )}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-zinc-900 text-[10px] font-bold text-white">
          CN
        </div>
        {!isIconOnly && (
          <span className="ml-2 truncate text-base font-semibold text-zinc-900">
            Xưởng IoT
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2" aria-label="Menu">
        {isIconOnly ? (
          <ul className="flex flex-col gap-0.5 px-1.5">
            {items.map((item, idx) => (
              <SidebarItem
                key={`${item.href}-${idx}`}
                item={item}
                pathname={pathname ?? "/"}
                allHrefs={allHrefs}
                iconOnly
              />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-2.5">
            {groups?.map((group) => (
              <div key={group.section} className="flex flex-col">
                <p
                  className="px-4 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
                  aria-hidden="true"
                >
                  {group.label}
                </p>
                <ul className="flex flex-col gap-px px-2">
                  {group.items.map((item, idx) => (
                    <SidebarItem
                      key={`${item.href}-${idx}`}
                      item={item}
                      pathname={pathname ?? "/"}
                      allHrefs={allHrefs}
                      iconOnly={false}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}

function SidebarItem({
  item,
  pathname,
  allHrefs,
  iconOnly = false,
}: {
  item: NavItem;
  pathname: string;
  allHrefs: string[];
  iconOnly?: boolean;
}) {
  const Icon = item.icon;
  const isActive = matchActive(pathname, item.href, allHrefs);

  const content = iconOnly ? (
    <Icon
      className={cn(
        "h-4 w-4 shrink-0 transition-colors duration-150",
        isActive ? "text-indigo-600" : "text-zinc-500",
      )}
      aria-hidden="true"
      strokeWidth={1.75}
    />
  ) : (
    <>
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors duration-150",
          isActive
            ? "text-indigo-600"
            : "text-zinc-500 group-hover:text-zinc-700",
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
    "group",
    iconOnly
      ? "relative flex h-9 items-center justify-center rounded-md"
      : "relative flex h-7 items-center gap-2 rounded-md px-3 text-base font-medium",
    "transition-all duration-150 ease-out",
    "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-[-2px]",
    isActive && !iconOnly
      ? "bg-indigo-50/60 text-indigo-700 pl-[10px] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:rounded-r before:bg-indigo-500"
      : isActive && iconOnly
        ? "bg-indigo-50/60 text-indigo-700"
        : "text-zinc-700 hover:bg-zinc-100/80 hover:text-zinc-900",
    item.disabled && "cursor-not-allowed text-zinc-400 hover:bg-transparent",
  );

  return (
    <li>
      {item.divider ? (
        <div
          aria-hidden="true"
          className={cn("my-1.5 h-px bg-zinc-100", iconOnly && "mx-2")}
        />
      ) : null}
      {item.disabled ? (
        <span
          aria-disabled="true"
          tabIndex={-1}
          className={baseClass}
          title={iconOnly ? item.label : undefined}
        >
          {content}
        </span>
      ) : (
        <Link
          href={item.href}
          aria-current={isActive ? "page" : undefined}
          aria-label={iconOnly ? item.label : undefined}
          title={iconOnly ? item.label : undefined}
          className={baseClass}
        >
          {content}
        </Link>
      )}
    </li>
  );
}

/**
 * Active matching V2 (fix highlight trùng parent-child):
 * - `/` chỉ active khi exact `/`.
 * - Exact match luôn active.
 * - Prefix match (`pathname.startsWith(href + "/")`) chỉ active khi
 *   KHÔNG có item khác nested sâu hơn cũng match (ví dụ `/bom/import`).
 *   Điều này tránh cả `/bom` và `/bom/import` cùng sáng khi ở `/bom/import`.
 */
function matchActive(
  pathname: string,
  href: string,
  allHrefs: string[] = [],
): boolean {
  if (href === "/") return pathname === "/";
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // Có item khác dài hơn + khớp pathname hơn → item này không active.
  for (const other of allHrefs) {
    if (other === href) continue;
    if (other === "/") continue;
    if (other.startsWith(`${href}/`)) {
      if (pathname === other || pathname.startsWith(`${other}/`)) return false;
    }
  }
  return true;
}
