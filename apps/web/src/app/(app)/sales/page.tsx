import { Building2, Calculator, ShoppingCart } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { SuppliersTab } from "@/components/sales/SuppliersTab";
import { POTab } from "@/components/sales/POTab";
import { AccountingTab } from "@/components/sales/AccountingTab";

export const dynamic = "force-dynamic";

/**
 * V3.2 — `/sales` Tài chính & Mua bán hub.
 *
 * 3 tabs:
 *   - suppliers   — Nhà cung cấp (V2 compact list)
 *   - po          — Đơn đặt hàng (PO)
 *   - accounting  — Kế toán & Thanh toán
 *
 * Header và breadcrumb đã được render trong từng tab component để có nhiều
 * không gian cho data, đồng thời thông tin contextual hơn (KPI, action buttons).
 */

const SALES_TABS = [
  { key: "suppliers",  label: "Nhà cung cấp",  icon: Building2    },
  { key: "po",         label: "Đặt hàng (PO)",  icon: ShoppingCart },
  { key: "accounting", label: "Kế toán",        icon: Calculator   },
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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50/30">
      <HubTabsNav
        basePath="/sales"
        tabs={SALES_TABS}
        active={active}
        ariaLabel="Finance sections"
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        {active === "suppliers"  && <SuppliersTab />}
        {active === "po"         && <POTab />}
        {active === "accounting" && <AccountingTab />}
      </div>
    </div>
  );
}
