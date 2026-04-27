import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V3 (TASK-20260427-025) — Generic Hub tabs nav (server-rendered).
 *
 * Tabs dùng URL search params `?tab=...` để giữ deep link + back/forward + SSR.
 * Dùng chung cho 4 hub pages: Warehouse / Sales / Engineering / Operations.
 *
 * Pattern kế thừa từ `WarehouseTabsNav` (TASK-014) và generalize lại.
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
                  "relative flex h-10 items-center gap-1.5 px-3 text-sm font-medium transition-colors",
                  isActive
                    ? "text-indigo-700"
                    : "text-zinc-600 hover:text-zinc-900",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t.label}
                {isActive ? (
                  <span
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-indigo-600"
                    aria-hidden="true"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
