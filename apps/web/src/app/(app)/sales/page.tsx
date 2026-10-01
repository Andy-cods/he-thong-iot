import { redirect } from "next/navigation";
import { Building2, ShoppingCart } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { SuppliersTab } from "@/components/sales/SuppliersTab";
import { POTab } from "@/components/sales/POTab";

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
 * làm tab con của `/sales`. Giữ `LEGACY_FIN_TAB_REDIRECT` bên dưới để MỌI
 * link/bookmark cũ `?tab=fin-*` (+ alias cũ hơn `fin-invoices`/`fin-payments`/
 * `fin-receivables`/`fin-accounts`/`fin-categories`) tự chuyển sang `/finance`
 * tương ứng — KHÔNG gãy link cũ (giữ nguyên mọi query khác, vd `invoiceId`).
 *
 * Route guard `/sales` (lib/route-guard.ts) nay chỉ còn admin/purchaser +
 * entities `po`/`supplier` (đã bỏ accountant/shareholder/`finance`).
 */
const SALES_TABS = [
  { key: "po", label: "Đặt hàng (PO)", icon: ShoppingCart },
  { key: "suppliers", label: "Nhà cung cấp", icon: Building2 },
] as const satisfies ReadonlyArray<HubTabDef>;

type SalesTab = (typeof SALES_TABS)[number]["key"];

/**
 * Map tab Tài chính cũ (từng ở `/sales`) → { tab, sub } mới ở `/finance`.
 * `fin-overview` đổi tên key thành `overview` (hub mới không cần tiền tố
 * `fin-` vì không còn lẫn với tab PO/Nhà cung cấp khác hub nữa).
 */
const LEGACY_FIN_TAB_REDIRECT: Record<string, { tab: string; sub?: string }> = {
  "fin-overview": { tab: "overview" },
  "fin-cashbook": { tab: "cashbook" },
  "fin-settle": { tab: "settle" },
  // Alias cũ hơn (trước TASK-20260922 gộp sub-tab) — vẫn thấy trong thông báo/
  // email cũ, worker reminder jobs trước khi sửa (defense in depth).
  "fin-invoices": { tab: "cashbook", sub: "invoices" },
  "fin-payments": { tab: "cashbook", sub: "payments" },
  "fin-receivables": { tab: "settle", sub: "receivables" },
  "fin-accounts": { tab: "settle", sub: "accounts" },
  "fin-categories": { tab: "settle", sub: "categories" },
};

interface SalesPageProps {
  searchParams: { tab?: string; sub?: string } & Record<string, string | string[] | undefined>;
}

export default function SalesPage({ searchParams }: SalesPageProps) {
  const requested = searchParams.tab;
  const legacyFin = requested ? LEGACY_FIN_TAB_REDIRECT[requested] : undefined;
  if (legacyFin) {
    const qs = new URLSearchParams();
    qs.set("tab", legacyFin.tab);
    const sub = typeof searchParams.sub === "string" ? searchParams.sub : legacyFin.sub;
    if (sub) qs.set("sub", sub);
    // Giữ nguyên MỌI query khác (vd `invoiceId` từ `financeInvoiceLink()`).
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === "tab" || k === "sub" || typeof v !== "string") continue;
      qs.set(k, v);
    }
    redirect(`/finance?${qs.toString()}`);
  }

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
