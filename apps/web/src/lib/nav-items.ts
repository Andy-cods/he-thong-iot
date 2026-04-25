import {
  Building2,
  Calculator,
  ClipboardList,
  Factory,
  FileSpreadsheet,
  LayoutDashboard,
  Network,
  Package,
  ShoppingCart,
  Shield,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { RbacEntity, Role } from "@iot/shared";
import { canAny } from "@iot/shared";

/**
 * Redesign V3 — nav-items registry.
 * Nguồn dữ liệu duy nhất cho Sidebar + CommandPalette + Breadcrumb.
 *
 * Group theo BỘ PHẬN thay vì function (V1.8) để khớp workflow xưởng:
 *   - dashboard:   Tổng quan (Trang chủ /)
 *   - warehouse:   Bộ phận Kho (Items + Lot/Serial + Receiving)
 *   - purchasing:  Bộ phận Mua bán (Suppliers + PO)
 *   - engineering: Bộ phận Kỹ thuật (BOM + Orders + WO + Assembly + PR + Import)
 *   - accounting:  Bộ phận Kế toán (Coming soon)
 *   - other:       Quản trị (Admin)
 *
 * @see plans/redesign-v3/{brainstorm,ui-redesign,implementation-plan,addendum-user-answers}.md
 */
export type NavSection =
  | "dashboard"
  | "warehouse"
  | "purchasing"
  | "engineering"
  | "accounting"
  | "other";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Legacy role gate — backward-compat V1.3. V1.4+ ưu tiên `entity`
   * (filter qua `canAny()` theo RBAC matrix).
   */
  roles?: Role[];
  /**
   * V1.4 — entity của RBAC matrix. Nếu set, item chỉ hiển thị khi user có
   * BẤT KỲ quyền nào trên entity (`canAny(userRoles, entity)`).
   */
  entity?: RbacEntity;
  /** True → render divider phía trên item này. */
  divider?: boolean;
  /** True → hiển thị mờ, disable click (feature chưa bật). */
  disabled?: boolean;
  /** Nhãn phụ hiển thị trong CommandPalette/tooltip khi disabled. */
  comingSoon?: string;
  /** Số hoặc chuỗi ngắn hiển thị bên phải label (VD: "3", "Sắp ra mắt"). */
  badge?: number | string;
  /** V3 — bộ phận chứa item này. Default `other`. */
  section?: NavSection;
}

export const NAV_SECTION_LABEL: Record<NavSection, string> = {
  dashboard: "Tổng quan",
  warehouse: "Bộ phận Kho",
  purchasing: "Bộ phận Mua bán",
  engineering: "Bộ phận Kỹ thuật",
  accounting: "Bộ phận Kế toán",
  other: "Quản trị",
};

export const NAV_SECTION_ORDER: NavSection[] = [
  "dashboard",
  "warehouse",
  "purchasing",
  "engineering",
  "accounting",
  "other",
];

export const NAV_ITEMS: NavItem[] = [
  // --- Tổng quan ---
  {
    href: "/",
    label: "Tổng quan",
    icon: LayoutDashboard,
    section: "dashboard",
  },
  // --- Bộ phận Kho ---
  {
    href: "/items",
    label: "Danh mục vật tư",
    icon: Package,
    entity: "item",
    section: "warehouse",
  },
  {
    href: "/lot-serial",
    label: "Lot / Serial",
    icon: Wrench,
    roles: ["admin", "planner", "operator", "warehouse"],
    section: "warehouse",
  },
  {
    href: "/receiving",
    label: "Nhận hàng",
    icon: Truck,
    roles: ["admin", "warehouse"],
    section: "warehouse",
  },
  // --- Bộ phận Mua bán ---
  {
    href: "/suppliers",
    label: "Nhà cung cấp",
    icon: Building2,
    entity: "supplier",
    section: "purchasing",
  },
  {
    href: "/procurement/purchase-orders",
    label: "Đặt hàng (PO)",
    icon: ShoppingCart,
    entity: "po",
    section: "purchasing",
  },
  // --- Bộ phận Kỹ thuật ---
  {
    href: "/bom",
    label: "BOM List",
    icon: Network,
    entity: "bomTemplate",
    section: "engineering",
  },
  {
    href: "/orders",
    label: "Đơn hàng",
    icon: ClipboardList,
    entity: "salesOrder",
    section: "engineering",
  },
  {
    href: "/work-orders",
    label: "Lệnh sản xuất",
    icon: Factory,
    entity: "wo",
    section: "engineering",
  },
  {
    href: "/assembly",
    label: "Lắp ráp",
    icon: Wrench,
    roles: ["admin", "planner", "operator"],
    section: "engineering",
  },
  {
    href: "/procurement/purchase-requests",
    label: "Yêu cầu mua (PR)",
    icon: ShoppingCart,
    entity: "pr",
    roles: ["admin", "planner"],
    section: "engineering",
  },
  {
    href: "/import",
    label: "Nhập Excel",
    icon: FileSpreadsheet,
    roles: ["admin", "planner"],
    section: "engineering",
  },
  // --- Bộ phận Kế toán (coming soon — Phase 2 V2.0) ---
  {
    href: "/accounting",
    label: "Kế toán",
    icon: Calculator,
    section: "accounting",
    disabled: true,
    badge: "Sắp ra mắt",
    comingSoon: "Phase 2 V2.0 — payment log + công nợ NCC",
  },
  // --- Quản trị ---
  {
    href: "/admin",
    label: "Quản trị",
    icon: Shield,
    roles: ["admin"],
    section: "other",
  },
];

/**
 * Lọc nav items theo roles của user hiện tại.
 *
 * Logic V1.4 (giữ nguyên):
 *   - Nếu item có `entity` → dùng `canAny(userRoles, entity)` (RBAC matrix).
 *   - Nếu chỉ có `roles` → fallback role-match (legacy).
 *   - Nếu không có cả 2 → hiển thị cho mọi user đã đăng nhập.
 *   - Nếu user có CẢ `roles` lẫn `entity` set → AND (phải thoả cả hai).
 *
 * Nếu `userRoles` undefined → giữ toàn bộ (dev/fallback).
 *
 * V3: item disabled vẫn được giữ (sidebar render mờ với badge "Sắp ra mắt").
 */
export function filterNavByRoles(
  items: NavItem[],
  userRoles: Role[] | undefined,
): NavItem[] {
  if (!userRoles || userRoles.length === 0) return items;
  return items.filter((it) => {
    if (it.entity && !canAny(userRoles, it.entity)) return false;
    if (it.roles && !it.roles.some((r) => userRoles.includes(r))) return false;
    return true;
  });
}

/**
 * Group nav items theo `section`. Items thiếu `section` → rơi vào `other`.
 * Giữ thứ tự item trong mỗi group như trong NAV_ITEMS.
 *
 * V3: với 6 section (dashboard/warehouse/purchasing/engineering/accounting/other).
 * Section rỗng (không có item nào sau filter role) sẽ KHÔNG render.
 */
export function groupNavBySection(
  items: NavItem[],
): Array<{ section: NavSection; label: string; items: NavItem[] }> {
  const map: Record<NavSection, NavItem[]> = {
    dashboard: [],
    warehouse: [],
    purchasing: [],
    engineering: [],
    accounting: [],
    other: [],
  };
  for (const it of items) {
    const sec: NavSection = it.section ?? "other";
    map[sec].push(it);
  }
  return NAV_SECTION_ORDER.filter((s) => map[s].length > 0).map((s) => ({
    section: s,
    label: NAV_SECTION_LABEL[s],
    items: map[s],
  }));
}
