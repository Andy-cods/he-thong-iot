"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { CommandPalette } from "@/components/command/CommandPalette";
import { Breadcrumb, useBreadcrumb } from "@/components/ui/breadcrumb";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NAV_ITEMS, filterNavByRoles, type NavItem } from "@/lib/nav-items";
import type { UserMenuUser } from "@/components/layout/UserMenu";
import { cn } from "@/lib/utils";
import type { Role } from "@iot/shared";

/**
 * Direction B — AppShell (design-spec §2.3).
 *
 * Responsive:
 * - < 768 px: sidebar drawer (slide-in bằng Sheet, hamburger trong TopBar).
 * - 768+ px: Sidebar persistent, collapsible (240 ↔ 56).
 *
 * Slot: Sidebar + TopBar (sticky) + Breadcrumb (sticky dưới TopBar) + <main>.
 * CommandPalette portal nằm tại shell, shared state qua useState (Ctrl+K open).
 *
 * Client component vì cần usePathname, useState, useRouter (logout).
 */
export interface AppShellProps {
  user: UserMenuUser;
  /** Nav items — mặc định dùng `NAV_ITEMS` registry. */
  navItems?: NavItem[];
  children: React.ReactNode;
}

export function AppShell({
  user,
  navItems = NAV_ITEMS,
  children,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const breadcrumbs = useBreadcrumb(pathname);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const userRoles = user.role
    ? (user.role.split(",").map((r) => r.trim()) as Role[])
    : undefined;

  const filteredNav = React.useMemo(
    () => filterNavByRoles(navItems, userRoles),
    [navItems, userRoles],
  );

  // Đóng drawer mobile mỗi khi pathname đổi (điều hướng xong).
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = React.useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }, [router]);

  return (
    <div
      className="flex min-h-screen w-full bg-bg-base"
      style={{ ["--sidebar-width" as string]: "15rem" }}
    >
      {/* Desktop sidebar (md+) */}
      <div className="hidden md:flex">
        <Sidebar navItems={filteredNav} />
      </div>

      {/* Mobile sidebar drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          size="sm"
          className="flex flex-col p-0"
          hideCloseButton
        >
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <Sidebar navItems={filteredNav} className="h-full w-full border-r-0" />
          </div>
        </SheetContent>
      </Sheet>

      {/* Right column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          user={user}
          onLogout={handleLogout}
          onSidebarToggle={() => setMobileOpen(true)}
          onCommandOpen={() => setPaletteOpen(true)}
        />

        {/* Breadcrumb row (chỉ desktop, md+) — mobile đã có ở TopBar */}
        <div
          className={cn(
            "sticky top-14 z-sticky hidden h-10 border-b border-slate-200 bg-white px-4 md:flex md:items-center xl:px-6",
          )}
        >
          <Breadcrumb items={breadcrumbs} />
        </div>

        <main
          id="main"
          className="flex-1 p-4 xl:mx-auto xl:w-full xl:max-w-[1440px] xl:p-6"
        >
          {children}
        </main>
      </div>

      {/* Command palette (Ctrl+K) */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        userRole={userRoles?.[0] as CommandPaletteRole | undefined}
      />
    </div>
  );
}

// CommandPalette expose role type riêng (admin|planner|warehouse|viewer),
// trong khi `@iot/shared` dùng `operator` thay `viewer`. Cast rõ tại biên.
type CommandPaletteRole = "admin" | "planner" | "warehouse" | "viewer";
