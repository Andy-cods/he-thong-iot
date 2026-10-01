import { redirect } from "next/navigation";
import { Building2, ShoppingCart } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { SuppliersTab } from "@/components/sales/SuppliersTab";
import { POTab } from "@/components/sales/POTab";
import { resolveLegacySalesFinRedirect } from "@/lib/legacy-redirects";

export const dynamic = "force-dynamic";

/**
 * TASK-20261001 — `/sales` Hub Bộ phận Thu mua.
 *
 * V3 (2026-10-01): TÁCH phân hệ Tài chính ra hub riêng `/finance` (mục menu
 * cấp 1 "Tài chính - Kế toán", xem `nav-items.ts` + `finance/page.tsx`) theo
 * yêu cầu chủ xưởng ("tư duy để làm hoàn chỉnh" — Tài chính không còn là tab
 * con của Thu mua). `/sales` giờ CHỈ còn 2 tab: Đặt hàng (PO) + Nhà cung cấp.
 *
 * Lịch sử: V2 (2026-09-22, TASK-20260922) từng gộp 9 tab → 5 tab rồi nhập
 * luôn 3 tab Tài chính (Tổng quan/Sổ quỹ/Công nợ & Thiết lập, key `fin-*`)
 * làm tab con của `/sales`. Logic redirect link cũ `?tab=fin-*` (+ alias cũ
 * hơn `fin-invoices`/`fin-payments`/`fin-receivables`/`fin-accounts`/
 * `fin-categories`) nay nằm ở `lib/legacy-redirects.ts` (dùng CHUNG với
 * `(app)/layout.tsx`, chạy TRƯỚC route-guard — xem QA-D P1-2: route-guard
 * `/sales` chỉ còn admin/purchaser nên accountant/shareholder gọi link cũ bị
 * chặn thẳng trước khi tới được code dưới đây). Giữ lại ở đây làm fallback —
 * không còn source-of-truth cho mapping (tránh lệch 2 nơi).
 *
 * Route guard `/sales` (lib/route-guard.ts) nay chỉ còn admin/purchaser +
 * entities `po`/`supplier` (đã bỏ accountant/shareholder/`finance`).
 */
const SALES_TABS = [
  { key: "po", label: "Đặt hàng (PO)", icon: ShoppingCart },
  { key: "suppliers", label: "Nhà cung cấp", icon: Building2 },
] as const satisfies ReadonlyArray<HubTabDef>;

type SalesTab = (typeof SALES_TABS)[number]["key"];

interface SalesPageProps {
  searchParams: { tab?: string; sub?: string } & Record<string, string | string[] | undefined>;
}

export default function SalesPage({ searchParams }: SalesPageProps) {
  const requested = searchParams.tab;
  const search = new URLSearchParams(
    Object.entries(searchParams).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  ).toString();
  const legacyTarget = resolveLegacySalesFinRedirect("/sales", search ? `?${search}` : "");
  if (legacyTarget) redirect(legacyTarget);

  const found = SALES_TABS.find((t) => t.key === requested);
  const active: SalesTab = found ? found.key : "po";

  return (
    <div className="flex flex-col bg-zinc-50/30 dark:bg-zinc-950/30 md:h-full md:overflow-hidden">
      <HubTabsNav
        basePath="/sales"
        tabs={SALES_TABS}
        active={active}
        ariaLabel="Purchasing sections"
      />

      <div className="flex-1 md:min-h-0 md:overflow-hidden">
        {active === "po" && <POTab />}
        {active === "suppliers" && <SuppliersTab />}
      </div>
    </div>
  );
}
