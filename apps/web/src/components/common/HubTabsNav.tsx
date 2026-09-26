import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollTabsList } from "@/components/common/ScrollTabsList";

/**
 * V3.2 — Generic Hub tabs nav (server-rendered).
 *
 * Tabs dùng URL search params `?tab=...` để giữ deep link + back/forward + SSR.
 * Dùng chung cho 4 hub pages: Warehouse / Sales / Engineering / Operations.
 *
 * V3.2 redesign: tăng kích thước icon + label, thêm hover background, underline indicator dày hơn.
 */

export interface HubTabDef<K extends string = string> {
  key: K;
  label: string;
  icon: LucideIcon;
}

export function HubTabsNav<K extends string>({
  basePath,
  tabs,
  active,
  ariaLabel,
}: {
  basePath: string;
  tabs: ReadonlyArray<HubTabDef<K>>;
  active: K;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* V4.1 UI-X6: cuộn ngang + nowrap — hết tràn trang trên điện thoại. */}
      <ScrollTabsList className="gap-1 px-2 md:px-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <li key={t.key} className="shrink-0">
              <Link
                href={`${basePath}?tab=${t.key}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-2 whitespace-nowrap rounded-t-md px-3 text-sm font-semibold transition-colors md:h-12 md:px-4",
                  "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t-full after:transition-all",
                  isActive
                    ? "text-indigo-700 after:bg-indigo-600 dark:text-indigo-300 dark:after:bg-indigo-400"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 after:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400 dark:text-zinc-500")} aria-hidden="true" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ScrollTabsList>
    </nav>
  );
}
