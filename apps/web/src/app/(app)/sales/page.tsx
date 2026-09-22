import { cookies } from "next/headers";
import {
  BarChart3,
  Building2,
  ShoppingCart,
  Wallet,
  Wallet2,
} from "lucide-react";
import type { Role } from "@iot/shared";
import { canAny } from "@iot/shared";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { HubTabsNav, type HubTabDef } from "@/components/common/HubTabsNav";
import { SuppliersTab } from "@/components/sales/SuppliersTab";
import { POTab } from "@/components/sales/POTab";
import { OverviewTab } from "@/components/finance/OverviewTab";
import { CashbookGroupTab } from "@/components/finance/CashbookGroupTab";
import { SettlementsGroupTab } from "@/components/finance/SettlementsGroupTab";

export const dynamic = "force-dynamic";

/**
 * TASK-20260922 — `/sales` Hub Bộ phận Thu mua.
 *
 * V2 (2026-09-22): gộp 9 tab → 5 tab theo yêu cầu user ("gộp các function
 * con vào được không nó dài quá không tối ưu layout"). Tiêu chí gộp: TẦN
 * SUẤT DÙNG + NGHIỆP VỤ LIÊN QUAN (không gộp bừa cho đủ số):
 *   - "Sổ quỹ" = Thu chi + Hoá đơn + Thanh toán — cùng nghiệp vụ dòng tiền
 *     hằng ngày, kế toán mở liên tục trong ca làm việc. Sub-tab cấp 2 bên
 *     trong (xem CashbookGroupTab).
 *   - "Công nợ & Thiết lập" = Công nợ + Tài khoản + Danh mục — Tài khoản/
 *     Danh mục là cấu hình ít đụng tới (setup 1 lần), gom chung với Công nợ
 *     (theo dõi định kỳ, không phải hằng ngày) để không chiếm thêm 1 tab
 *     cấp 1 riêng. Sub-tab cấp 2 bên trong (xem SettlementsGroupTab).
 *   - "Tổng quan TC" giữ nguyên standalone vì đã là dashboard, không có gì
 *     để gộp thêm.
 *   - PO / Nhà cung cấp giữ nguyên — khác nghiệp vụ (mua hàng vs dòng tiền),
 *     dùng bởi role purchaser (không phải accountant).
 *
 * Lọc tab theo role:
 *   - po/suppliers → chỉ role purchaser + admin (`group: "purchasing"`).
 *     KHÔNG dùng `canAny(roles, "po")` vì accountant cũng có `po: ["read"]`
 *     trong RBAC matrix (để đối chiếu công nợ qua API) — nếu lọc theo entity
 *     thì tab PO sẽ lộ ra cho accountant dù đó không phải chức năng của họ.
 *   - 3 tab tài chính → `canAny(roles, "finance")` (accountant/shareholder/admin).
 *
 * Route guard `/sales` (layout.tsx) đã mở cho admin/purchaser/accountant/
 * shareholder. Việc lọc TAB (không phải route) đảm bảo accountant/shareholder
 * vào /sales chỉ thấy đúng tab Tài chính, không thấy PO/Nhà cung cấp — và
 * ngược lại purchaser không thấy tab Tài chính.
 *
 * `/finance` cũ giữ lại làm alias redirect (xem `finance/page.tsx`) → vẫn trỏ
 * `?tab=fin-overview` (tab này KHÔNG đổi tên/gộp nên không gãy).
 *
 * Deep-link cũ (`?tab=fin-invoices`, `?tab=fin-payments`, `?tab=fin-receivables`,
 * `?tab=fin-accounts`, `?tab=fin-categories`) được tự map sang tab gộp đúng
 * sub-tab qua `LEGACY_TAB_REDIRECT` bên dưới — không gãy bookmark cũ.
 */
const PURCHASING_ROLES: Role[] = ["admin", "purchaser"];

const SALES_TABS = [
  { key: "po",           label: "Đặt hàng (PO)",       icon: ShoppingCart, group: "purchasing" as const },
  { key: "suppliers",    label: "Nhà cung cấp",        icon: Building2,    group: "purchasing" as const },
  { key: "fin-overview", label: "TC: Tổng quan",       icon: BarChart3,    group: "finance" as const },
  { key: "fin-cashbook", label: "TC: Sổ quỹ",          icon: Wallet,       group: "finance" as const },
  { key: "fin-settle",   label: "TC: Công nợ & Thiết lập", icon: Wallet2,  group: "finance" as const },
] as const satisfies ReadonlyArray<HubTabDef & { group: "purchasing" | "finance" }>;

type SalesTab = (typeof SALES_TABS)[number]["key"];

/**
 * Map tab cũ (trước khi gộp) → { tab mới, sub mới } để bookmark/link cũ vẫn
 * mở đúng nội dung. `fin-overview` không có trong map vì không đổi tên.
 */
const LEGACY_TAB_REDIRECT: Record<string, { tab: SalesTab; sub: string }> = {
  "fin-invoices":    { tab: "fin-cashbook", sub: "invoices" },
  "fin-payments":    { tab: "fin-cashbook", sub: "payments" },
  "fin-receivables": { tab: "fin-settle",   sub: "receivables" },
  "fin-accounts":    { tab: "fin-settle",   sub: "accounts" },
  "fin-categories":  { tab: "fin-settle",   sub: "categories" },
};

/** Tab hiện hay ẩn theo group: "purchasing" cần role purchaser/admin (role-based,
 *  không dùng entity vì accountant cũng có quyền read entity "po"); "finance"
 *  dùng entity RBAC chuẩn. */
function isTabVisible(group: "purchasing" | "finance", roles: Role[]): boolean {
  if (group === "finance") return canAny(roles, "finance");
  return roles.some((r) => PURCHASING_ROLES.includes(r));
}

interface SalesPageProps {
  searchParams: { tab?: string; sub?: string } & Record<string, string | string[] | undefined>;
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

  const requested = searchParams.tab;
  const legacy = requested ? LEGACY_TAB_REDIRECT[requested] : undefined;
  const effectiveTab = legacy?.tab ?? requested;
  const effectiveSub = legacy?.sub ?? searchParams.sub;

  // Fallback an toàn: nếu vì lý do gì đó không tab nào hiện (không nên xảy ra
  // vì route guard /sales đã chặn user không có quyền po/supplier/finance),
  // vẫn cần 1 giá trị hợp lệ cho HubTabsNav thay vì undefined.
  const found = visibleTabs.find((t) => t.key === effectiveTab);
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
        {active === "po"           && <POTab />}
        {active === "suppliers"    && <SuppliersTab />}
        {active === "fin-overview" && <OverviewTab />}
        {active === "fin-cashbook" && <CashbookGroupTab initialSub={effectiveSub} />}
        {active === "fin-settle"   && <SettlementsGroupTab initialSub={effectiveSub} />}
      </div>
    </div>
  );
}
