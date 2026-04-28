import Link from "next/link";
import { Layers, Map, PackageCheck, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V3 (TASK-20260427-014) — Warehouse tabs nav (server-rendered).
 *
 * Tabs dùng URL search params `?tab=...` thay cho client state để giữ deep
 * link + back/forward + SSR friendly. Component này render trên server.
 */

export const WAREHOUSE_TABS = [
  {
    key: "layout" as const,
    label: "Sơ đồ kho",
    icon: Map,
  },
  {
    key: "items" as const,
    label: "Vật tư",
    icon: Tag,
  },
  {
    key: "lot-serial" as const,
    label: "Lô & Serial",
    icon: Layers,
  },
  {
    key: "receiving" as const,
    label: "Nhận hàng",
    icon: PackageCheck,
  },
];

export type WarehouseTab = (typeof WAREHOUSE_TABS)[number]["key"];

export function WarehouseTabsNav({
  active,
}: {
  active: WarehouseTab;
}) {
  return (
    <nav
      aria-label="Warehouse sections"
      className="border-b border-zinc-200 bg-white"
    >
      <ul className="flex items-center gap-1 px-4">
        {WAREHOUSE_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <li key={t.key}>
              <Link
                href={`/warehouse?tab=${t.key}`}
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
