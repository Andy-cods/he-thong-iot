import Link from "next/link";
import { Factory, Inbox, Wrench } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { WorkOrdersTab } from "@/components/engineering/WorkOrdersTab";
import { AssemblyOverviewTab } from "@/components/operations/AssemblyOverviewTab";

export const dynamic = "force-dynamic";

/**
 * V3.7.47 — `/operations` Bộ phận Vận hành (3 tabs).
 *
 * Tabs:
 *   - requests   — Yêu cầu sản xuất (DRAFT WOs từ TK-A) — VH-A duyệt/từ chối
 *   - orders     — Lệnh sản xuất (RELEASED+) — đang/đã sản xuất
 *   - assembly   — Quy trình lắp ráp (xưởng + scan barcode)
 *
 * Phân biệt rõ ràng giữa "yêu cầu" (chờ duyệt) và "lệnh chính thức".
 */

const OPERATIONS_TABS = [
  { key: "requests", label: "Yêu cầu sản xuất", icon: Inbox },
  { key: "orders", label: "Lệnh sản xuất", icon: Factory },
  { key: "assembly", label: "Quy trình lắp ráp", icon: Wrench },
] as const satisfies ReadonlyArray<HubTabDef>;

type OperationsTab = (typeof OPERATIONS_TABS)[number]["key"];

interface OperationsPageProps {
  searchParams: { tab?: string } & Record<string, string | string[] | undefined>;
}

function resolveTab(raw: string | undefined): OperationsTab {
  const found = OPERATIONS_TABS.find((t) => t.key === raw);
  return found ? found.key : "requests";
}

export default function OperationsPage({ searchParams }: OperationsPageProps) {
  const active = resolveTab(searchParams.tab);
  const tabLabel =
    OPERATIONS_TABS.find((t) => t.key === active)?.label ?? "Yêu cầu sản xuất";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white px-6 pb-3 pt-4">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="text-zinc-500">Bộ phận Vận hành</span>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">{tabLabel}</span>
        </nav>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900">
          Vận hành
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Duyệt yêu cầu Thiết kế · Theo dõi lệnh sản xuất · Quy trình lắp ráp xưởng.
        </p>
      </div>

      <HubTabsNav
        basePath="/operations"
        tabs={OPERATIONS_TABS}
        active={active}
        ariaLabel="Operations sections"
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        {active === "requests" ? (
          <WorkOrdersTab variant="operations-requests" />
        ) : active === "orders" ? (
          <WorkOrdersTab variant="operations-orders" />
        ) : (
          <AssemblyOverviewTab />
        )}
      </div>
    </div>
  );
}
