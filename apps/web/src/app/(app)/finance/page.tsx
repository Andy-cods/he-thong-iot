import { BarChart3, Wallet, Wallet2 } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { OverviewTabLazy } from "@/components/finance/OverviewTabLazy";
import { CashbookGroupTab } from "@/components/finance/CashbookGroupTab";
import { SettlementsGroupTab } from "@/components/finance/SettlementsGroupTab";

export const dynamic = "force-dynamic";

/**
 * TASK-20261001 — Hub "Tài chính - Kế toán" (`/finance`), TÁCH khỏi `/sales`
 * (Bộ phận Thu mua) theo yêu cầu chủ xưởng: "tư duy để làm hoàn chỉnh" —
 * Tài chính xứng đáng là mục menu cấp 1 riêng, không còn là tab con của Thu
 * mua (lịch sử gộp cũ: xem comment TASK-20260922 từng ở `sales/page.tsx`).
 *
 * 3 tab, URL `?tab=overview|cashbook|settle&sub=...`:
 *   - `overview` — Tổng quan (KPI + dòng tiền).
 *   - `cashbook` — Sổ quỹ (sub: transactions/invoices/payments).
 *   - `settle`   — Công nợ & Thiết lập (sub: receivables/accounts/categories).
 *
 * Route guard `/finance` (lib/route-guard.ts) đã có sẵn từ trước (khi `/finance`
 * còn là redirect) — cho admin/accountant/shareholder (entity `finance`).
 * `/sales` cũ redirect MỌI link `?tab=fin-*` sang đây (giữ nguyên query khác,
 * vd `invoiceId`) — xem `LEGACY_FIN_TAB_REDIRECT` trong `sales/page.tsx`.
 */
const FINANCE_TABS = [
  { key: "overview", label: "Tổng quan", icon: BarChart3 },
  { key: "cashbook", label: "Sổ quỹ", icon: Wallet },
  { key: "settle", label: "Công nợ & Thiết lập", icon: Wallet2 },
] as const satisfies ReadonlyArray<HubTabDef>;

type FinanceTab = (typeof FINANCE_TABS)[number]["key"];

interface FinancePageProps {
  searchParams: { tab?: string; sub?: string } & Record<string, string | string[] | undefined>;
}

export default function FinancePage({ searchParams }: FinancePageProps) {
  // Route guard `/finance` (middleware/layout) đã chặn user không có quyền
  // `finance` trước khi tới đây — không cần lọc tab theo role như `/sales`
  // (chỉ 1 nhóm "finance", mọi vai được vào trang đều thấy đủ 3 tab).
  const requested = searchParams.tab;
  const active: FinanceTab = FINANCE_TABS.some((t) => t.key === requested)
    ? (requested as FinanceTab)
    : "overview";
  const sub = typeof searchParams.sub === "string" ? searchParams.sub : undefined;

  return (
    <div className="flex flex-col bg-zinc-50/30 dark:bg-zinc-950/30 md:h-full md:overflow-hidden">
      <HubTabsNav
        basePath="/finance"
        tabs={FINANCE_TABS}
        active={active}
        ariaLabel="Finance sections"
      />

      <div className="flex-1 md:min-h-0 md:overflow-hidden">
        {active === "overview" && <OverviewTabLazy />}
        {active === "cashbook" && <CashbookGroupTab initialSub={sub} />}
        {active === "settle" && <SettlementsGroupTab initialSub={sub} />}
      </div>
    </div>
  );
}
