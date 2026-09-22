import { BarChart3, Banknote, BookOpen, CreditCard, FolderTree, Receipt, Wallet } from "lucide-react";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { OverviewTab } from "@/components/finance/OverviewTab";
import { CashbookTab } from "@/components/finance/CashbookTab";
import { InvoicesTab } from "@/components/finance/InvoicesTab";
import { PaymentsTab } from "@/components/finance/PaymentsTab";
import { ReceivablesTab } from "@/components/finance/ReceivablesTab";
import { AccountsTab } from "@/components/finance/AccountsTab";
import { CategoriesTab } from "@/components/finance/CategoriesTab";

export const dynamic = "force-dynamic";

/**
 * V4.0 đợt 2 (TASK-20260922-001) Phase E — `/finance` hub.
 *
 * 7 tab theo plan `plans/v4-finance/wave-2-finance.md` §E.2. Bám pattern
 * `/sales` (HubTabsNav + tab components tự render header/breadcrumb riêng).
 * Phân quyền: route guard `/finance` (layout.tsx) đã cho phép
 * admin/accountant/shareholder vào; ẩn nút Tạo/Sửa/Xoá cho shareholder được
 * xử lý TRONG từng tab bằng `can(roles, action, "finance")`.
 */

const FINANCE_TABS = [
  { key: "overview",     label: "Tổng quan",           icon: BarChart3   },
  { key: "cashbook",     label: "Thu chi",              icon: Wallet      },
  { key: "invoices",     label: "Hoá đơn",              icon: Receipt     },
  { key: "payments",     label: "Thanh toán",           icon: CreditCard  },
  { key: "receivables",  label: "Công nợ",              icon: BookOpen    },
  { key: "accounts",     label: "Tài khoản",            icon: Banknote    },
  { key: "categories",   label: "Danh mục",             icon: FolderTree  },
] as const satisfies ReadonlyArray<HubTabDef>;

type FinanceTab = (typeof FINANCE_TABS)[number]["key"];

interface FinancePageProps {
  searchParams: { tab?: string } & Record<string, string | string[] | undefined>;
}

function resolveTab(raw: string | undefined): FinanceTab {
  const found = FINANCE_TABS.find((t) => t.key === raw);
  return found ? found.key : "overview";
}

export default function FinancePage({ searchParams }: FinancePageProps) {
  const active = resolveTab(searchParams.tab);

  return (
    <div className="flex flex-col bg-zinc-50/30 dark:bg-zinc-950/30 md:h-full md:overflow-hidden">
      <HubTabsNav
        basePath="/finance"
        tabs={FINANCE_TABS}
        active={active}
        ariaLabel="Finance sections"
      />

      <div className="flex-1 md:min-h-0 md:overflow-hidden">
        {active === "overview"    && <OverviewTab />}
        {active === "cashbook"    && <CashbookTab />}
        {active === "invoices"    && <InvoicesTab />}
        {active === "payments"    && <PaymentsTab />}
        {active === "receivables" && <ReceivablesTab />}
        {active === "accounts"    && <AccountsTab />}
        {active === "categories"  && <CategoriesTab />}
      </div>
    </div>
  );
}
