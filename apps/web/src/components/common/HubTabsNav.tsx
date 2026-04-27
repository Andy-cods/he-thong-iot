import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <nav aria-label={ariaLabel} className="border-b border-zinc-200 bg-white">
      <ul className="flex items-center gap-1 px-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <li key={t.key}>
              <Link
                href={`${basePath}?tab=${t.key}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-12 items-center gap-2 rounded-t-md px-4 text-sm font-semibold transition-colors",
                  "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t-full after:transition-all",
                  isActive
                    ? "text-indigo-700 after:bg-indigo-600"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 after:bg-transparent",
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-indigo-600" : "text-zinc-400")} aria-hidden="true" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
