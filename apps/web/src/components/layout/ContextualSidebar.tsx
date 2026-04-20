"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, FolderTree } from "lucide-react";
import type { Role } from "@iot/shared";
import { canAny } from "@iot/shared";
import { cn } from "@/lib/utils";
import {
  buildBomContextNav,
  type ContextualNavItem,
} from "@/lib/contextual-nav";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";

export interface ContextualSidebarProps {
  bomId: string;
  bomCode: string;
  bomName: string;
  bomStatus: BadgeStatus;
  bomStatusLabel: string;
  counts?: Partial<Record<string, number>>;
  userRoles?: Role[];
  className?: string;
}

/**
 * BOM Workspace Contextual Sidebar.
 *
 * Render bên cạnh global sidebar (đã thu gọn icon-only 56px) khi user ở
 * `/bom/[id]/*`. Header hiển thị BOM code + name + status + link "← Thoát
 * workspace" về `/bom`. Nav items build từ `buildBomContextNav(bomId)`
 * filter theo RBAC.
 */
export function ContextualSidebar({
  bomId,
  bomCode,
  bomName,
  bomStatus,
  bomStatusLabel,
  counts,
  userRoles,
  className,
}: ContextualSidebarProps) {
  const pathname = usePathname() ?? "";
  const rawItems = React.useMemo(
    () => buildBomContextNav(bomId, counts),
    [bomId, counts],
  );
  const items = React.useMemo(() => {
    if (!userRoles || userRoles.length === 0) return rawItems;
    return rawItems.filter((it) => {
      if (it.entity && !canAny(userRoles, it.entity)) return false;
      if (it.roles && !it.roles.some((r) => userRoles.includes(r))) return false;
      return true;
    });
  }, [rawItems, userRoles]);

  return (
    <aside
      aria-label="Menu BOM Workspace"
      className={cn(
        "relative z-sidebar flex h-full w-[220px] shrink-0 flex-col border-r border-zinc-200 bg-white",
        className,
      )}
    >
      {/* Workspace header — 64px */}
      <div className="flex h-16 flex-col justify-center border-b border-zinc-100 px-4">
        <Link
          href="/bom"
          className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500 transition-colors hover:text-indigo-600"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Thoát workspace
        </Link>
        <div className="mt-0.5 flex items-center gap-2">
          <FolderTree
            className="h-4 w-4 shrink-0 text-indigo-500"
            aria-hidden="true"
          />
          <span
            className="truncate font-mono text-sm font-semibold text-zinc-900"
            title={bomName}
          >
            {bomCode}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          <StatusBadge status={bomStatus} size="sm" label={bomStatusLabel} />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2" aria-label="Menu BOM">
        <ul className="flex flex-col gap-0.5 px-2">
          {items.map((item, idx) => (
            <ContextualSidebarItem
              key={`${item.href}-${idx}`}
              item={item}
              pathname={pathname}
            />
          ))}
        </ul>
      </nav>

      {/* Footer — hint for workspace exit */}
      <div className="border-t border-zinc-100 px-4 py-2 text-[10px] text-zinc-400">
        BOM-centric workspace · V1.6
      </div>
    </aside>
  );
}

function ContextualSidebarItem({
  item,
  pathname,
}: {
  item: ContextualNavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const isActive = matchActive(pathname, item.href);

  const content = (
    <>
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors duration-100",
          isActive ? "text-indigo-600" : "text-zinc-500",
        )}
        aria-hidden="true"
        strokeWidth={1.75}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && item.badge !== null && item.badge !== 0 ? (
        <span className="ml-auto inline-flex h-[18px] items-center rounded-sm bg-zinc-100 px-1.5 text-[10px] font-medium text-zinc-600">
          {item.badge}
        </span>
      ) : null}
    </>
  );

  const baseClass = cn(
    "relative flex h-7 items-center gap-2 rounded-md px-3 text-base font-medium transition-colors duration-100 ease-out",
    "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-[-2px]",
    isActive
      ? "bg-indigo-50 text-indigo-700 pl-[10px] before:absolute before:left-0 before:top-1 before:h-5 before:w-0.5 before:rounded-r before:bg-indigo-500"
      : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900",
  );

  return (
    <li>
      {item.divider ? (
        <div aria-hidden="true" className="my-1.5 h-px bg-zinc-100" />
      ) : null}
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={baseClass}
      >
        {content}
      </Link>
    </li>
  );
}

// Exact match for `/bom/[id]`, prefix match for sub-routes.
function matchActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // `/bom/[id]` chỉ active khi exact (đừng bắt `/bom/[id]/orders`)
  const segments = href.split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "bom") {
    return false;
  }
  return pathname.startsWith(`${href}/`) || pathname === href;
}
