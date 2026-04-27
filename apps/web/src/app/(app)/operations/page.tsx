import Link from "next/link";
import { Wrench } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { AssemblyTab } from "@/components/operations/AssemblyTab";

export const dynamic = "force-dynamic";

/**
 * V3 (TASK-20260427-025) — `/operations` Bộ phận Vận hành hub.
 *
 * Hiện tại chỉ có 1 tab Lắp ráp. Để sẵn HubTabsNav để mở rộng:
 *   - `assembly`  — Lắp ráp (re-use /assembly landing)
 *   - sau này:     Quality (QC), Maintenance (bảo trì), v.v.
 *
 * Route cũ /assembly redirect về `/operations?tab=assembly`. Workspace
 * /assembly/[woId] giữ nguyên.
 */

const OPERATIONS_TABS = [
  { key: "assembly", label: "Lắp ráp", icon: Wrench },
] as const satisfies ReadonlyArray<HubTabDef>;

type OperationsTab = (typeof OPERATIONS_TABS)[number]["key"];

interface OperationsPageProps {
  searchParams: { tab?: string } & Record<string, string | string[] | undefined>;
}

function resolveTab(raw: string | undefined): OperationsTab {
  const found = OPERATIONS_TABS.find((t) => t.key === raw);
  return found ? found.key : "assembly";
}

export default function OperationsPage({
  searchParams,
}: OperationsPageProps) {
  const active = resolveTab(searchParams.tab);
  const tabLabel =
    OPERATIONS_TABS.find((t) => t.key === active)?.label ?? "Lắp ráp";

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
          Lắp ráp đang sẵn sàng. Quality &amp; Maintenance sẽ thêm sau.
        </p>
      </div>

      <HubTabsNav
        basePath="/operations"
        tabs={OPERATIONS_TABS}
        active={active}
        ariaLabel="Operations sections"
      />

      <div className="flex-1 min-h-0 overflow-auto p-4">
        <AssemblyTab />
      </div>
    </div>
  );
}
