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

  // V3.7.57 — Filter tabs theo role. BOM List mở cho TẤT CẢ bộ phận xem.
  //   - admin/planner: full 3 tabs (BOM + WO + PR)
  //   - operator (Gia công): BOM + PR (tạo MRF GTAM mua phôi)
  //   - warehouse (Kho): BOM + PR (xem tồn + tạo MRF)
  //   - purchaser (Thu mua): BOM only (xem để biết vật tư trước khi duyệt PR)
  const isAdminOrPlanner =
    roles.includes("admin") || roles.includes("planner");
  const isWarehouse = roles.includes("warehouse");
  const isOperator = roles.includes("operator");
  const isPurchaser = roles.includes("purchaser");
  // V3.9 — qc + accountant CHỈ thấy tab PR (không có bomTemplate:read).
  const isQc = roles.includes("qc");
  const isAccountant = roles.includes("accountant");

  const tabs = React.useMemo(() => {
    if (isAdminOrPlanner) return ALL_TABS;
    const allowedKeys = new Set<string>();
    // Mọi non-admin/planner role đều thấy tab BOM (read-only)
    if (isWarehouse || isOperator || isPurchaser) {
      allowedKeys.add("bom");
    }
    if (isWarehouse || isOperator) {
      allowedKeys.add("pr"); // tạo MRF GTAM
    }
    // V3.9 — qc/accountant chỉ đề xuất mua vật tư (không đụng BOM).
    if (isQc || isAccountant) {
      allowedKeys.add("pr");
    }
    return ALL_TABS.filter((t) => allowedKeys.has(t.key));
  }, [isAdminOrPlanner, isWarehouse, isOperator, isPurchaser, isQc, isAccountant]);

  const rawTab = searchParams?.get("tab") ?? undefined;
  const found = tabs.find((t) => t.key === rawTab);
  const defaultTab = (tabs[0]?.key ?? "bom") as EngineeringTab;
  const active: EngineeringTab = found ? found.key : defaultTab;
  const tabLabel = tabs.find((t) => t.key === active)?.label ?? "BOM List";

  const breadcrumbDept = isAdminOrPlanner
    ? "Bộ phận Thiết kế"
    : isWarehouse
      ? "Bộ phận Kho"
      : isOperator
        ? "Bộ phận Gia công"
        : isPurchaser
          ? "Bộ phận Thu mua"
          : isQc
            ? "Tổ QC/KCS"
            : isAccountant
              ? "Bộ phận Kế toán"
              : "Bộ phận";
  const pageTitle = isAdminOrPlanner
    ? "Thiết kế & Sản xuất"
    : isWarehouse
      ? "Tồn kho & Đề xuất mua"
      : isOperator
        ? "Sản xuất & Đề xuất mua phôi"
        : isQc || isAccountant
          ? "Đề xuất mua vật tư"
          : "BOM List · Yêu cầu mua";
  const pageSubtitle = isAdminOrPlanner
    ? "BOM List · Yêu cầu sản xuất (gửi Gia công duyệt) · Yêu cầu mua."
    : isWarehouse
      ? "Xem BOM List · điều chỉnh tồn kho · gửi Phiếu MRF GTAM đến Thu mua."
      : isOperator
        ? "Xem BOM List · tạo Phiếu MRF GTAM mua phôi gửi Bộ phận Thu mua."
        : isQc || isAccountant
          ? "Tạo & theo dõi Phiếu đề xuất vật tư (YCVT/MRF) gửi Thu mua duyệt."
          : "Xem BOM List để đối chiếu vật tư · duyệt yêu cầu mua hàng tại /sales.";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white px-6 pb-3 pt-4 dark:border-zinc-800 dark:bg-zinc-900">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-50">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <span className="text-zinc-500 dark:text-zinc-400">{breadcrumbDept}</span>
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{tabLabel}</span>
        </nav>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {pageTitle}
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{pageSubtitle}</p>
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
