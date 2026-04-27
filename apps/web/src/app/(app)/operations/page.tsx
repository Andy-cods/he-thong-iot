import Link from "next/link";
import { Factory, Wrench } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { WorkOrdersTab } from "@/components/engineering/WorkOrdersTab";

export const dynamic = "force-dynamic";

/**
 * V3.1 — `/operations` Bộ phận Vận hành.
 * Gộp "Sản xuất" + "Lệnh SX" thành 1 tab duy nhất với toggle table/card.
 */

const OPERATIONS_TABS = [
  { key: "wo", label: "Lệnh sản xuất", icon: Factory },
] as const satisfies ReadonlyArray<HubTabDef>;

type OperationsTab = (typeof OPERATIONS_TABS)[number]["key"];

interface OperationsPageProps {
  searchParams: { tab?: string } & Record<string, string | string[] | undefined>;
}

function resolveTab(raw: string | undefined): OperationsTab {
  const found = OPERATIONS_TABS.find((t) => t.key === raw);
  return found ? found.key : "wo";
}

export default function OperationsPage({ searchParams }: OperationsPageProps) {
  const active = resolveTab(searchParams.tab);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white px-6 pb-3 pt-4">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">Bộ phận Vận hành</span>
        </nav>
        <div className="mt-1.5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              Vận hành
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              Quản lý lệnh sản xuất · vào xưởng lắp ráp từ mỗi WO.
            </p>
          </div>
          <Link
            href="/assembly"
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100 transition-colors"
          >
            <Wrench className="h-3.5 w-3.5" aria-hidden />
            Xưởng lắp ráp
          </Link>
        </div>
      </div>

      <HubTabsNav
        basePath="/operations"
        tabs={OPERATIONS_TABS}
        active={active}
        ariaLabel="Operations sections"
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        <WorkOrdersTab />
      </div>
    </div>
  );
}
