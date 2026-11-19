"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardEdit, History, LayoutGrid, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSelectedSite, useShiftContext } from "@/hooks/useShiftOutput";
import { QueueBadge } from "./OfflineQueuePanel";

/**
 * V4.10 (TASK-20261118-001) — khung module Sản lượng ca: tiêu đề + xưởng đang
 * xem (admin chọn được nếu có nhiều xưởng) + badge "Chờ gửi" + 5 tab
 * Hôm nay | Nhập ca | Lịch sử | Báo cáo | Cài đặt (ẩn tab không có quyền).
 */
const SiteCtx = React.createContext<string | null>(null);
export const useShiftSite = () => React.useContext(SiteCtx);

export interface ShellPermissions {
  report: boolean;
  setup: boolean;
}

const TABS = [
  { href: "/san-luong/hom-nay", label: "Hôm nay", icon: LayoutGrid, need: null },
  { href: "/san-luong/nhap", label: "Nhập ca", icon: ClipboardEdit, need: null },
  { href: "/san-luong/lich-su", label: "Lịch sử", icon: History, need: null },
  { href: "/san-luong/bao-cao", label: "Báo cáo", icon: BarChart3, need: "report" },
  { href: "/san-luong/cai-dat", label: "Cài đặt", icon: Settings, need: "setup" },
] as const;

export function ShiftOutputShell({ permissions, children }: { permissions: ShellPermissions; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [stored, setSelected] = useSelectedSite();
  const selected = stored || null;
  const ctx = useShiftContext(selected);
  const sites = ctx.data?.sites ?? [];
  // null = site mặc định của phạm vi (server chọn) — cùng query key với các tab
  // nên không tải 2 lần. Site đã lưu không còn trong phạm vi (404) → bỏ chọn.
  const siteId = selected && (ctx.isLoading || sites.some((s) => s.id === selected)) ? selected : null;
  React.useEffect(() => {
    if (selected && ctx.isError) setSelected("");
  }, [selected, ctx.isError, setSelected]);
  const tabs = TABS.filter((t) => t.need === null || permissions[t.need]);

  return (
    <SiteCtx.Provider value={siteId}>
      <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2.5 sm:px-4 lg:px-6">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Sản lượng ca</h1>
            {sites.length > 1 ? (
              <select
                aria-label="Chọn xưởng"
                value={siteId ?? ctx.data?.site.id ?? ""}
                onChange={(e) => setSelected(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-[16px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 md:text-md"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="truncate text-md text-zinc-500 dark:text-zinc-400">{ctx.data?.site.name ?? ""}</span>
            )}
            <span className="ml-auto">
              <QueueBadge />
            </span>
          </div>
          <nav aria-label="Sản lượng ca" className="mx-auto w-full max-w-6xl overflow-x-auto px-1 sm:px-2 lg:px-4">
            <ul className="flex min-w-max gap-0.5">
              {tabs.map((t) => {
                const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
                const Icon = t.icon;
                return (
                  <li key={t.href}>
                    <Link
                      href={t.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-12 items-center gap-1.5 whitespace-nowrap px-3 text-md font-semibold transition-colors",
                        "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t-full",
                        active
                          ? "text-indigo-700 after:bg-indigo-600 dark:text-indigo-300 dark:after:bg-indigo-400"
                          : "text-zinc-500 after:bg-transparent hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {t.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </SiteCtx.Provider>
  );
}
