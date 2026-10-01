"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { buildBreadcrumbItems } from "@/lib/breadcrumb-items";
import { UserMenu, type UserMenuUser } from "@/components/layout/UserMenu";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ThemeQuickToggle } from "@/components/theme/ThemeToggle";
import { formatShortcut } from "@/lib/shortcuts";
import { useBomDetail } from "@/hooks/useBom";
import { useLotHistory } from "@/hooks/useLotSerial";
import { cn } from "@/lib/utils";
import { ScrollTabsList } from "@/components/common/ScrollTabsList";
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

function matchActive(pathname: string, hrefRaw: string, allHrefs: string[] = []): boolean {
  // V4.3 mục 4.3 — nav item có thể trỏ kèm query (vd "/warehouse?tab=movement&mode=qc"
  // cho role qc) — so khớp active theo PATHNAME, bỏ phần query.
  const href = hrefRaw.split("?")[0] ?? hrefRaw;
  if (href === "/") return pathname === "/";
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  for (const otherRaw of allHrefs) {
    const other = otherRaw.split("?")[0] ?? otherRaw;
    if (other === href || other === "/") continue;
    if (other.startsWith(`${href}/`)) {
      if (pathname === other || pathname.startsWith(`${other}/`)) return false;
    }
  }
  return true;
}

/**
 * V4.1 X6: breadcrumb đọc `?tab=` của trang hub để thêm nhãn tab làm crumb cuối.
 * Tách component riêng vì `useSearchParams` cần nằm trong <Suspense> (Next 14
 * app router) — fallback là breadcrumb không có tab.
 */
function TopBarBreadcrumbWithTab({
  pathname,
  segmentLabels,
}: {
  pathname: string;
  segmentLabels?: Record<string, string | undefined>;
}) {
  const tab = useSearchParams()?.get("tab") ?? null;
  const items = React.useMemo(
    () => buildBreadcrumbItems(pathname, segmentLabels, tab),
    [pathname, segmentLabels, tab],
  );
  return <Breadcrumb items={items} />;
}

function TopBarBreadcrumb({
  pathname,
  segmentLabels,
}: {
  pathname: string;
  segmentLabels?: Record<string, string | undefined>;
}) {
  const fallbackItems = React.useMemo(
    () => buildBreadcrumbItems(pathname, segmentLabels),
    [pathname, segmentLabels],
  );
  return (
    <React.Suspense fallback={<Breadcrumb items={fallbackItems} />}>
      <TopBarBreadcrumbWithTab pathname={pathname} segmentLabels={segmentLabels} />
    </React.Suspense>
  );
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
  // V4.1 UI-BOM: breadcrumb workspace BOM hiện MÃ BOM thay UUID thô. Dùng
  // chung query cache `useBomDetail` với trang lưới → không gọi API thêm.
  const bomId = React.useMemo(() => {
    const m = /^\/bom\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/|$)/i.exec(pathname);
    return m ? m[1]! : null;
  }, [pathname]);
  const bomDetail = useBomDetail(bomId);
  const bomCode = bomDetail.data?.data?.template?.code;
  // V4.4 UI D2#4 — chi tiết lô: hiện mã lô/serial thay UUID thô (chỉ gọi khi ở /lot-serial/<id>).
  const lotId = React.useMemo(() => {
    const m = /^\/lot-serial\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/|$)/i.exec(pathname);
    return m ? m[1]! : null;
  }, [pathname]);
  const lotDetail = useLotHistory(lotId);
  const lotLabel =
    lotDetail.data?.data?.lot?.lotCode ?? lotDetail.data?.data?.lot?.serialCode ?? lotDetail.data?.data?.lot?.itemSku ?? null;
  const segmentLabels = React.useMemo(() => {
    const labels: Record<string, string> = {};
    if (bomId && bomCode) labels[bomId] = bomCode;
    if (lotId && lotLabel) labels[lotId] = lotLabel;
    return Object.keys(labels).length > 0 ? labels : undefined;
  }, [bomId, bomCode, lotId, lotLabel]);
  const shortcutLabel = formatShortcut("Mod+K");

  return (
    <header
      role="banner"
      className={cn(
        // V4.3 Apple — thanh trên mờ (vibrancy): nền trắng ~80% + backdrop-blur,
        // hairline mảnh thay border đậm + shadow.
        "sticky top-0 z-topbar border-b border-zinc-900/[0.06] bg-white/80 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/80",
        "dark:border-white/[0.08] dark:bg-zinc-900/70",
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
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors md:hidden dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
          )}

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-[11px] font-bold text-white shadow-sm dark:bg-indigo-500">
              CN
            </div>
            <span className="hidden font-semibold text-zinc-900 sm:inline dark:text-zinc-50">Xưởng IoT</span>
          </Link>

          <div className="mx-1 hidden h-4 w-px bg-zinc-200 sm:block dark:bg-zinc-800" />

          {/* Breadcrumb */}
          <div className="hidden min-w-0 md:block">
            <TopBarBreadcrumb pathname={pathname} segmentLabels={segmentLabels} />
          </div>
        </div>

        {/* Right — search + bell + user */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Search full (xl) */}
          <button
            type="button"
            onClick={onCommandOpen}
            aria-label={`Tìm kiếm và lệnh (${shortcutLabel})`}
            className="hidden h-8 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-500 hover:border-zinc-300 hover:bg-white hover:text-zinc-700 transition-colors xl:flex dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            style={{ minWidth: 200 }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="flex-1 text-left">Tìm kiếm và lệnh...</span>
            <kbd className="rounded border border-zinc-200 bg-white px-1.5 font-mono text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500">{shortcutLabel}</kbd>
          </button>

          {/* Search icon (md-xl) */}
          <button
            type="button"
            onClick={onCommandOpen}
            aria-label={`Tìm kiếm (${shortcutLabel})`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors xl:hidden dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>

          {/* V3.7.67 Theme toggle */}
          <ThemeQuickToggle />

          {/* V3.3 Real notification bell với dropdown panel */}
          <NotificationBell />

          <UserMenu user={user} onLogout={onLogout} />
        </div>
      </div>

      {/* ── Row 2: Horizontal nav (desktop md+) ── */}
      {navItems.length > 0 && (
        <nav
          aria-label="Điều hướng chính"
          className="hidden border-t border-zinc-900/[0.06] md:block dark:border-white/[0.08]"
        >
          {/* V4.5 QA-E P1: bọc ScrollTabsList — hết tràn ngang trang ở 768/1280px
              (trước đây `justify-center` trần đẩy mục đầu/cuối ra ngoài khung hình
              không có cách cuộn lại). Cố tình KHÔNG dùng justify-center ở đây: khi
              nội dung tràn, `justify-content: center` làm phần đầu bị kẹt ở vùng
              scrollLeft âm (không thể cuộn tới) — cùng lỗi gốc đang sửa. Căn trái
              giống mọi nơi khác dùng component này (Kho/Thu mua/BOM). Mép mờ 2
              bên + tự cuộn tab đang chọn vào tầm nhìn lúc mount đến từ component
              dùng chung. */}
          <ScrollTabsList className="gap-1 px-4 xl:px-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = matchActive(pathname, item.href, allHrefs);

              if (item.disabled) {
                return (
                  <li key={item.href} className="shrink-0">
                    <span className="relative flex items-center gap-2.5 px-4 py-3 text-[15px] font-medium text-zinc-300 cursor-not-allowed select-none dark:text-zinc-700">
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                      <span>{item.label}</span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 px-4 py-3 text-[15px] font-medium transition-colors duration-150 whitespace-nowrap",
                      "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-t-full after:transition-all after:duration-150",
                      isActive
                        ? "text-indigo-600 after:bg-indigo-600 dark:text-indigo-400 dark:after:bg-indigo-400"
                        : "text-zinc-600 hover:text-zinc-900 after:bg-transparent hover:after:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-50 dark:hover:after:bg-zinc-700",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-colors",
                        isActive ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400 dark:text-zinc-500",
                      )}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="ml-0.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ScrollTabsList>
        </nav>
      )}
    </header>
  );
}
