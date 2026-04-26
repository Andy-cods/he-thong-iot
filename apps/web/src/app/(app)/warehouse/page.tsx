import Link from "next/link";
import {
  WAREHOUSE_TABS,
  WarehouseTabsNav,
  type WarehouseTab,
} from "@/components/warehouse/WarehouseTabsNav";
import { OverviewTab } from "@/components/warehouse/OverviewTab";
import { ItemsTab } from "@/components/warehouse/ItemsTab";
import { LotSerialTab } from "@/components/warehouse/LotSerialTab";
import { ReceivingTab } from "@/components/warehouse/ReceivingTab";

export const dynamic = "force-dynamic";

/**
 * V3 (TASK-20260427-014) — `/warehouse` Quản lí kho unified.
 *
 * Server Component wrapper:
 *   1. Đọc `searchParams.tab` (default = 'overview').
 *   2. Render breadcrumb + tabs nav (server).
 *   3. Switch render đúng tab component (client component).
 *
 * Tabs:
 *   - `overview`  — KPI tổng quan (SKU, lot, PO chờ, lot HOLD)
 *   - `items`     — Danh mục vật tư (re-use logic /items cũ)
 *   - `lot-serial`— Lô & Serial (re-use + Hold/Release wired API thật)
 *   - `receiving` — Nhận hàng (re-use + Approve/Reject wired API thật)
 *
 * Note: Các trang `/items`, `/lot-serial`, `/receiving` cũ đã redirect
 * về đây với param tab tương ứng (TASK-012 đã handle).
 */

interface WarehousePageProps {
  searchParams: { tab?: string } & Record<string, string | string[] | undefined>;
}

function resolveTab(raw: string | undefined): WarehouseTab {
  const found = WAREHOUSE_TABS.find((t) => t.key === raw);
  return found ? found.key : "overview";
}

export default function WarehousePage({ searchParams }: WarehousePageProps) {
  const active = resolveTab(searchParams.tab);
  const tabLabel =
    WAREHOUSE_TABS.find((t) => t.key === active)?.label ?? "Tổng quan";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white px-6 pb-3 pt-4">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="text-zinc-500">Kho</span>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">Quản lí kho</span>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="text-zinc-700">{tabLabel}</span>
        </nav>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900">
          Quản lí kho
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Trang gộp Vật tư · Lô & Serial · Nhận hàng. Đặt nền cho map vị trí
          kệ/bin V2.
        </p>
      </div>

      <WarehouseTabsNav active={active} />

      <div className="flex-1 min-h-0 overflow-auto">
        {active === "overview" ? (
          <OverviewTab />
        ) : active === "items" ? (
          <ItemsTab />
        ) : active === "lot-serial" ? (
          <LotSerialTab />
        ) : (
          <ReceivingTab />
        )}
      </div>
    </div>
  );
}
