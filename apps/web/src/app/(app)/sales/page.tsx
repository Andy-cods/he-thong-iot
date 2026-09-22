import { cookies } from "next/headers";
import {
  BarChart3,
  Banknote,
  Building2,
  BookOpen,
  CreditCard,
  FolderTree,
  Receipt,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import type { Role } from "@iot/shared";
import { canAny } from "@iot/shared";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { SuppliersTab } from "@/components/sales/SuppliersTab";
import { POTab } from "@/components/sales/POTab";
import { OverviewTab } from "@/components/finance/OverviewTab";
import { CashbookTab } from "@/components/finance/CashbookTab";
import { InvoicesTab } from "@/components/finance/InvoicesTab";
import { PaymentsTab } from "@/components/finance/PaymentsTab";
import { ReceivablesTab } from "@/components/finance/ReceivablesTab";
import { AccountsTab } from "@/components/finance/AccountsTab";
import { CategoriesTab } from "@/components/finance/CategoriesTab";

export const dynamic = "force-dynamic";

/**
 * TASK-20260922 — `/sales` Hub Bộ phận Thu mua.
 *
 * Gộp Tài chính làm tab con theo yêu cầu user ("tôi muốn function tài chính
 * là function con của bộ phận thu mua"). 9 tab, lọc theo quyền:
 *   - po / suppliers   → chỉ role purchaser + admin (`group: "purchasing"`).
 *     KHÔNG dùng `canAny(roles, "po")` vì accountant cũng có `po: ["read"]`
 *     trong RBAC matrix (để đối chiếu công nợ qua API) — nếu lọc theo entity
 *     thì tab PO sẽ lộ ra cho accountant dù đó không phải chức năng của họ.
 *   - 7 tab tài chính  → `canAny(roles, "finance")` (accountant/shareholder/admin).
 *
 * Route guard `/sales` (layout.tsx) đã mở cho admin/purchaser/accountant/
 * shareholder. Việc lọc TAB (không phải route) đảm bảo accountant/shareholder
 * vào /sales chỉ thấy đúng 7 tab Tài chính, không thấy PO/Nhà cung cấp —
 * và ngược lại purchaser không thấy tab Tài chính.
 *
 * `/finance` cũ giữ lại làm alias redirect (xem `finance/page.tsx`) để không
 * gãy link/bookmark — trỏ sang tab `fin-overview` bên dưới.
 *
 * Tab tài chính đặt tiền tố `fin-` để tránh đụng key với po/suppliers.
 */
const PURCHASING_ROLES: Role[] = ["admin", "purchaser"];

const SALES_TABS = [
  { key: "po",              label: "Đặt hàng (PO)",  icon: ShoppingCart, group: "purchasing" as const },
  { key: "suppliers",       label: "Nhà cung cấp",   icon: Building2,    group: "purchasing" as const },
  { key: "fin-overview",    label: "TC: Tổng quan",  icon: BarChart3,    group: "finance" as const },
  { key: "fin-cashbook",    label: "TC: Thu chi",    icon: Wallet,       group: "finance" as const },
  { key: "fin-invoices",    label: "TC: Hoá đơn",    icon: Receipt,      group: "finance" as const },
  { key: "fin-payments",    label: "TC: Thanh toán", icon: CreditCard,   group: "finance" as const },
  { key: "fin-receivables", label: "TC: Công nợ",    icon: BookOpen,     group: "finance" as const },
  { key: "fin-accounts",    label: "TC: Tài khoản",  icon: Banknote,     group: "finance" as const },
  { key: "fin-categories",  label: "TC: Danh mục",   icon: FolderTree,   group: "finance" as const },
] as const satisfies ReadonlyArray<HubTabDef & { group: "purchasing" | "finance" }>;

type SalesTab = (typeof SALES_TABS)[number]["key"];

/** Tab hiện hay ẩn theo group: "purchasing" cần role purchaser/admin (role-based,
 *  không dùng entity vì accountant cũng có quyền read entity "po"); "finance"
 *  dùng entity RBAC chuẩn. */
function isTabVisible(group: "purchasing" | "finance", roles: Role[]): boolean {
  if (group === "finance") return canAny(roles, "finance");
  return roles.some((r) => PURCHASING_ROLES.includes(r));
}

interface SalesPageProps {
  searchParams: { tab?: string } & Record<string, string | string[] | undefined>;
}

/** Đọc roles từ JWT cookie (server component) — không cần round-trip DB. */
async function getRolesFromCookie(): Promise<Role[]> {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return [];
  const payload = await verifyAccessToken(token);
  return payload?.roles ?? [];
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const roles = await getRolesFromCookie();
  const visibleTabs = SALES_TABS.filter((t) => isTabVisible(t.group, roles));

  // Fallback an toàn: nếu vì lý do gì đó không tab nào hiện (không nên xảy ra
  // vì route guard /sales đã chặn user không có quyền po/supplier/finance),
  // vẫn cần 1 giá trị hợp lệ cho HubTabsNav thay vì undefined.
  const requested = searchParams.tab;
  const found = visibleTabs.find((t) => t.key === requested);
  const active: SalesTab = found ? found.key : (visibleTabs[0]?.key ?? "po");

  return (
    <div className="flex flex-col bg-zinc-50/30 dark:bg-zinc-950/30 md:h-full md:overflow-hidden">
      <HubTabsNav
        basePath="/sales"
        tabs={visibleTabs}
        active={active}
        ariaLabel="Purchasing sections"
      />

      <div className="flex-1 md:min-h-0 md:overflow-hidden">
        {active === "po"              && <POTab />}
        {active === "suppliers"       && <SuppliersTab />}
        {active === "fin-overview"    && <OverviewTab />}
        {active === "fin-cashbook"    && <CashbookTab />}
        {active === "fin-invoices"    && <InvoicesTab />}
        {active === "fin-payments"    && <PaymentsTab />}
        {active === "fin-receivables" && <ReceivablesTab />}
        {active === "fin-accounts"    && <AccountsTab />}
        {active === "fin-categories"  && <CategoriesTab />}
      </div>
    </div>
  );
}
