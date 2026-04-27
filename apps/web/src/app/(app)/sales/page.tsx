import Link from "next/link";
import { Building2, ShoppingCart } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { SuppliersTab } from "@/components/sales/SuppliersTab";
import { POTab } from "@/components/sales/POTab";

export const dynamic = "force-dynamic";

/**
 * V3 (TASK-20260427-025) — `/sales` Bộ phận Mua bán hub.
 *
 * Server Component wrapper, gộp 2 module vào 1 hub:
 *   - `suppliers` — Nhà cung cấp (re-use logic /suppliers cũ)
 *   - `po`        — Đặt hàng (PO) (re-use logic /procurement/purchase-orders cũ)
 *
 * Tabs dùng URL `?tab=...`. Routes cũ /suppliers, /procurement/purchase-orders
 * đã redirect về đây. Detail pages (/suppliers/[id], /purchase-orders/[id])
 * giữ nguyên không động.
 */

const SALES_TABS = [
  { key: "suppliers", label: "Nhà cung cấp", icon: Building2 },
  { key: "po", label: "Đặt hàng (PO)", icon: ShoppingCart },
] as const satisfies ReadonlyArray<HubTabDef>;

type SalesTab = (typeof SALES_TABS)[number]["key"];

interface SalesPageProps {
  searchParams: { tab?: string } & Record<string, string | string[] | undefined>;
}

function resolveTab(raw: string | undefined): SalesTab {
  const found = SALES_TABS.find((t) => t.key === raw);
  return found ? found.key : "suppliers";
}

export default function SalesPage({ searchParams }: SalesPageProps) {
  const active = resolveTab(searchParams.tab);
  const tabLabel =
    SALES_TABS.find((t) => t.key === active)?.label ?? "Nhà cung cấp";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white px-6 pb-3 pt-4">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="text-zinc-500">Bộ phận Mua bán</span>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">{tabLabel}</span>
        </nav>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900">
          Mua bán
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Trang gộp Nhà cung cấp · Đặt hàng (PO).
        </p>
      </div>

      <HubTabsNav
        basePath="/sales"
        tabs={SALES_TABS}
        active={active}
        ariaLabel="Sales sections"
      />

      <div className="flex-1 min-h-0 overflow-auto">
        {active === "suppliers" ? <SuppliersTab /> : <POTab />}
      </div>
    </div>
  );
}
