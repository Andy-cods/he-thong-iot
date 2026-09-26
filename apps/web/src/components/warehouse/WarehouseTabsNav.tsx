import Link from "next/link";
import {
  ArrowLeftRight,
  BarChart3,
  FileOutput,
  FileText,
  Map,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V4.1 (Wave 5 Phase A) — Warehouse tabs nav (server-rendered).
 *
 * Tabs dùng URL search params `?tab=...` thay cho client state để giữ deep
 * link + back/forward + SSR friendly. Component này render trên server.
 *
 * `receiving` + `issue` đã gộp thành 1 tab `movement` (segmented control
 * Nhập/Xuất bên trong `<MovementTab>`). Href mặc định trỏ `mode=in`; nav active
 * state không phân biệt mode (đổi mode không đổi "nơi chốn" — xem plan Phase C).
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
    key: "movement" as const,
    label: "Nhập / Xuất kho",
    icon: ArrowLeftRight,
  },
  // V4.1 Đợt 1b (Q3) — sổ phiếu xuất kho PX (mọi đường xuất).
  {
    key: "goods-issues" as const,
    label: "Phiếu xuất kho",
    icon: FileOutput,
  },
  // V4.0 Wave 3 Phase D — Phiếu giao hàng / BBGH (xuất bán, trả NCC).
  {
    key: "delivery-notes" as const,
    label: "Phiếu giao hàng",
    icon: FileText,
  },
  {
    key: "report" as const,
    label: "Báo cáo kho",
    icon: BarChart3,
  },
];

export type WarehouseTab = (typeof WAREHOUSE_TABS)[number]["key"];

const TAB_HREF: Record<WarehouseTab, string> = {
  layout: "/warehouse?tab=layout",
  items: "/warehouse?tab=items",
  movement: "/warehouse?tab=movement&mode=in",
  "goods-issues": "/warehouse?tab=goods-issues",
  "delivery-notes": "/warehouse?tab=delivery-notes",
  report: "/warehouse?tab=report",
};

export function WarehouseTabsNav({
  active,
}: {
  active: WarehouseTab;
}) {
  return (
    <nav
      aria-label="Warehouse sections"
      className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <ul className="flex items-center gap-1 overflow-x-auto px-4">
        {WAREHOUSE_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <li key={t.key}>
              <Link
                href={TAB_HREF[t.key]}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-10 items-center gap-1.5 whitespace-nowrap px-3 text-sm font-medium transition-colors",
                  isActive
                    ? "text-indigo-700 dark:text-indigo-300"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t.label}
                {isActive ? (
                  <span
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-indigo-600 dark:bg-indigo-400"
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
