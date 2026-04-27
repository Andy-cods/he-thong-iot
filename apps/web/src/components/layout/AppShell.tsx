"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
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
import { cn } from "@/lib/utils";

function isBomWorkspacePath(pathname: string): boolean {
  const m = /^\/bom\/([0-9a-f-]{8,})(\/|$)/.exec(pathname);
  if (!m) return false;
  const id = m[1]!;
  return id !== "new" && id !== "import";
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

export interface AppShellProps {
  user: UserMenuUser;
  navItems?: NavItem[];
  children: React.ReactNode;
}

export function AppShell({ user, navItems = NAV_ITEMS, children }: AppShellProps) {
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

  const allHrefs = filteredNav.map((i) => i.href);

  const isWorkspace = React.useMemo(() => isBomWorkspacePath(pathname), [pathname]);

  React.useEffect(() => { setMobileOpen(false); }, [pathname]);

  const handleLogout = React.useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }, [router]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-zinc-50">

      {/* ══ TOP BAR với horizontal nav ══ */}
      <TopBar
        user={user}
        onLogout={handleLogout}
        onSidebarToggle={() => setMobileOpen(true)}
        onCommandOpen={() => setPaletteOpen(true)}
        navItems={filteredNav}
        pathname={pathname}
        allHrefs={allHrefs}
      />

      {/* ══ MOBILE DRAWER ══ */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" size="sm" className="flex flex-col p-0 w-[280px]" hideCloseButton>
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex-1 overflow-y-auto py-3 px-3">
            <ul className="flex flex-col gap-0.5">
              {filteredNav.map((item) => {
                const Icon = item.icon;
                const isActive = matchActive(pathname, item.href, allHrefs);
                return (
                  <li key={item.href}>
                    {item.disabled ? (
                      <span className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-400 cursor-not-allowed">
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">{item.badge}</span>}
                      </span>
                    ) : (
                      <Link href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900",
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-indigo-600" : "text-zinc-500")} strokeWidth={1.75} />
                        <span className="flex-1">{item.label}</span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </SheetContent>
      </Sheet>

      {/* ══ MAIN CONTENT ══ */}
      <main
        id="main"
        className={
          isWorkspace
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "flex-1 px-4 py-4 md:px-6 md:py-5 xl:mx-auto xl:w-full xl:max-w-[1440px]"
        }
      >
        {children}
      </main>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        userRole={userRoles?.[0] as CommandPaletteRole | undefined}
      />
    </div>
  );
}

type CommandPaletteRole = "admin" | "planner" | "warehouse" | "viewer";
