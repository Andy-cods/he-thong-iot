"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { CommandPalette } from "@/components/command/CommandPalette";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NAV_ITEMS, filterNavByRoles, type NavItem } from "@/lib/nav-items";
import type { UserMenuUser } from "@/components/layout/UserMenu";
import type { Role } from "@iot/shared";

/**
 * V2 AppShell — Linear-inspired grid layout.
 *
 * Desktop (>= md): sidebar 220px fixed left + topbar 44px sticky top +
 *   main content padding 24x / 20y, max-w 1440 center.
 * Mobile (< md): topbar 56px + hamburger menu; sidebar slide-in drawer
 *   (Sheet width 280px — giữ chuẩn touch).
 *
 * CSS vars exposed: --sidebar-width 220px, --topbar-height 44px.
 * CommandPalette portal shared state (Ctrl+K global).
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
      className="flex min-h-screen w-full bg-zinc-50"
      style={{
        ["--sidebar-width" as string]: "13.75rem", // 220px
        ["--topbar-height" as string]: "2.75rem", // 44px
      }}
    >
      {/* Desktop sidebar (md+) — 220px fixed */}
      <div className="hidden md:flex">
        <Sidebar navItems={filteredNav} />
      </div>

      {/* Mobile sidebar drawer — 280px slide-in */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          size="sm"
          className="flex flex-col p-0 md:w-[280px]"
          hideCloseButton
        >
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <Sidebar
              navItems={filteredNav}
              className="h-full w-full border-r-0"
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Right column: topbar + main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          user={user}
          onLogout={handleLogout}
          onSidebarToggle={() => setMobileOpen(true)}
          onCommandOpen={() => setPaletteOpen(true)}
        />

        <main
          id="main"
          className="flex-1 px-4 py-4 md:px-6 md:py-5 xl:mx-auto xl:w-full xl:max-w-[1440px]"
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
