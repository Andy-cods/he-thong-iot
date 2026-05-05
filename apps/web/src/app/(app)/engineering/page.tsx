"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Factory, Network, ShoppingCart } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { BomTab } from "@/components/engineering/BomTab";
import { WorkOrdersTab } from "@/components/engineering/WorkOrdersTab";
import { PRTab } from "@/components/engineering/PRTab";
import { useSession } from "@/hooks/useSession";

/**
 * V3 (TASK-20260427-025) — `/engineering` Bộ phận Thiết kế & Sản xuất hub.
 *
 * V3.7.53 — Convert sang client component để filter tabs theo role.
 * Warehouse role chỉ thấy tab BOM (read-only theo dõi tồn kho linh kiện).
 *
 * Routes cũ /bom, /work-orders, /procurement/purchase-requests redirect về đây.
 * Detail pages (/bom/[id]/grid, /work-orders/[id], ...) giữ nguyên.
 */

const ALL_TABS = [
  { key: "bom", label: "BOM List", icon: Network },
  { key: "work-orders", label: "Yêu cầu sản xuất", icon: Factory },
  { key: "pr", label: "Yêu cầu mua", icon: ShoppingCart },
] as const satisfies ReadonlyArray<HubTabDef>;

type EngineeringTab = (typeof ALL_TABS)[number]["key"];

export default function EngineeringPage() {
  const searchParams = useSearchParams();
  const session = useSession();
  const roles = session.data?.roles ?? [];

  // V3.7.53 — warehouse chỉ thấy BOM (xem tồn kho), không thấy WO/PR.
  const isWarehouseOnly =
    roles.includes("warehouse") &&
    !roles.includes("admin") &&
    !roles.includes("planner");

  const tabs = React.useMemo(
    () => (isWarehouseOnly ? ALL_TABS.filter((t) => t.key === "bom") : ALL_TABS),
    [isWarehouseOnly],
  );

  const rawTab = searchParams?.get("tab") ?? undefined;
  const found = tabs.find((t) => t.key === rawTab);
  const active: EngineeringTab = found ? found.key : "bom";
  const tabLabel = tabs.find((t) => t.key === active)?.label ?? "BOM List";

  const breadcrumbDept = isWarehouseOnly ? "Bộ phận Kho" : "Bộ phận Thiết kế";
  const pageTitle = isWarehouseOnly
    ? "BOM List · Theo dõi tồn kho"
    : "Thiết kế & Sản xuất";
  const pageSubtitle = isWarehouseOnly
    ? "Xem BOM List · điều chỉnh tồn kho linh kiện trực tiếp."
    : "BOM List · Yêu cầu sản xuất (gửi Gia công duyệt) · Yêu cầu mua.";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white px-6 pb-3 pt-4">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="text-zinc-500">{breadcrumbDept}</span>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">{tabLabel}</span>
        </nav>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900">
          {pageTitle}
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">{pageSubtitle}</p>
      </div>

      {tabs.length > 1 ? (
        <HubTabsNav
          basePath="/engineering"
          tabs={tabs}
          active={active}
          ariaLabel="Engineering sections"
        />
      ) : null}

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
