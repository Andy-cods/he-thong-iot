import Link from "next/link";
import { Inbox, Wrench } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { WorkOrdersTab } from "@/components/engineering/WorkOrdersTab";
import { AssemblyOverviewTab } from "@/components/operations/AssemblyOverviewTab";
import { HIDDEN_FEATURES } from "@/lib/hidden-features";

export const dynamic = "force-dynamic";

/**
 * V3.7.47 — `/operations` Bộ phận Gia công.
 *
 * Tabs:
 *   - requests   — Yêu cầu sản xuất (DRAFT WOs từ TK-A) — VH-A duyệt/từ chối
 *   - assembly   — Quy trình lắp ráp (xưởng)
 *
 * Phân biệt rõ ràng giữa "yêu cầu" (chờ duyệt) và "lệnh chính thức".
 *
 * V4.0 — ẨN tab "Lệnh sản xuất" theo yêu cầu user. Danh sách lệnh sản xuất
 * KHÔNG mất: vẫn xem được ở `/engineering?tab=work-orders` (cùng component
 * `WorkOrdersTab`, chỉ khác variant), và mọi link chi tiết `/work-orders/[id]`
 * vẫn hoạt động bình thường. `resolveTab` tự fallback về "requests" nếu ai đó
 * còn bookmark `?tab=orders`.
 */

const ALL_OPERATIONS_TABS = [
  { key: "requests", label: "Yêu cầu sản xuất", icon: Inbox },
  { key: "assembly", label: "Quy trình lắp ráp", icon: Wrench },
] as const satisfies ReadonlyArray<HubTabDef>;

type OperationsTab = (typeof ALL_OPERATIONS_TABS)[number]["key"];

// V4.1 D10 — ẩn tab "Quy trình lắp ráp" (lắp ráp kiểu cũ cần đơn hàng bán,
// đang ẩn cùng Đơn hàng bán). `?tab=assembly` cũ rơi về "requests".
const OPERATIONS_TABS = ALL_OPERATIONS_TABS.filter(
  (t) => !(t.key === "assembly" && HIDDEN_FEATURES.legacyAssembly),
);

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
    <div className="flex flex-col md:h-full md:overflow-hidden">
      <div className="border-b border-zinc-200 bg-white px-4 pb-3 pt-4 md:px-6 dark:border-zinc-800 dark:bg-zinc-900">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-50">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <span className="text-zinc-500 dark:text-zinc-400">Bộ phận Gia công</span>
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{tabLabel}</span>
        </nav>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Gia công
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Duyệt yêu cầu sản xuất từ Thiết kế · Theo dõi lệnh sản xuất.
        </p>
      </div>

      <HubTabsNav
        basePath="/operations"
        tabs={OPERATIONS_TABS}
        active={active}
        ariaLabel="Operations sections"
      />

      <div className="flex-1 md:min-h-0 md:overflow-hidden">
        {active === "requests" ? (
          <WorkOrdersTab variant="operations-requests" />
        ) : (
          <AssemblyOverviewTab />
        )}
      </div>
    </div>
  );
}
