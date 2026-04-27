import Link from "next/link";
import { Factory, Network, ShoppingCart } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { BomTab } from "@/components/engineering/BomTab";
import { WorkOrdersTab } from "@/components/engineering/WorkOrdersTab";
import { PRTab } from "@/components/engineering/PRTab";

export const dynamic = "force-dynamic";

/**
 * V3 (TASK-20260427-025) — `/engineering` Bộ phận Thiết kế & Sản xuất hub.
 *
 * Server Component wrapper, gộp 3 module:
 *   - `bom`         — BOM List
 *   - `work-orders` — Lệnh sản xuất (Work Orders)
 *   - `pr`          — Yêu cầu mua (Purchase Requests)
 *
 * Routes cũ /bom, /work-orders, /procurement/purchase-requests redirect về đây.
 * Detail pages (/bom/[id]/grid, /work-orders/[id], ...) giữ nguyên.
 */

const ENGINEERING_TABS = [
  { key: "bom", label: "BOM List", icon: Network },
  { key: "work-orders", label: "Lệnh sản xuất", icon: Factory },
  { key: "pr", label: "Yêu cầu mua", icon: ShoppingCart },
] as const satisfies ReadonlyArray<HubTabDef>;

type EngineeringTab = (typeof ENGINEERING_TABS)[number]["key"];

interface EngineeringPageProps {
  searchParams: { tab?: string } & Record<string, string | string[] | undefined>;
}

function resolveTab(raw: string | undefined): EngineeringTab {
  const found = ENGINEERING_TABS.find((t) => t.key === raw);
  return found ? found.key : "bom";
}

export default function EngineeringPage({
  searchParams,
}: EngineeringPageProps) {
  const active = resolveTab(searchParams.tab);
  const tabLabel =
    ENGINEERING_TABS.find((t) => t.key === active)?.label ?? "BOM List";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white px-6 pb-3 pt-4">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="text-zinc-500">Bộ phận Thiết kế</span>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">{tabLabel}</span>
        </nav>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900">
          Thiết kế & Sản xuất
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Trang gộp BOM List · Lệnh sản xuất · Yêu cầu mua.
        </p>
      </div>

      <HubTabsNav
        basePath="/engineering"
        tabs={ENGINEERING_TABS}
        active={active}
        ariaLabel="Engineering sections"
      />

      <div className="flex-1 min-h-0 overflow-auto">
        {active === "bom" ? (
          <BomTab />
        ) : active === "work-orders" ? (
          <WorkOrdersTab />
        ) : (
          <PRTab />
        )}
      </div>
    </div>
  );
}
