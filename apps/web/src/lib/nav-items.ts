import {
  Building2,
  ClipboardList,
  Factory,
  FileSpreadsheet,
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
 * Direction B — nav-items registry.
 * Nguồn dữ liệu duy nhất cho Sidebar + CommandPalette + Breadcrumb.
 * Role filter: item không có `roles` → hiển thị cho tất cả.
 *
 * V1.8 — Batch 1:
 *   - Bỏ landing Dashboard khỏi nav (landing `/` redirect `/bom`).
 *   - Bỏ nav `/product-lines` (gộp chức năng vào `/items`).
 *   - Bỏ nav `/eco` + `/shortage` (vẫn accessible trong BOM workspace).
 *   - Thêm field `section` để Sidebar group 3 nhóm (Sản xuất / Kho & Mua sắm / Khác).
 *
 * @see docs design-spec §2.3 AppShell + §3.2 Sidebar + plans/260424-v1.8-ux-refresh-plan.md
 */
export type NavSection = "production" | "inventory" | "other";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Legacy role gate — để backward-compat V1.3. V1.4 ưu tiên `entity`
   * (filter qua `canAny()` theo RBAC matrix).
   */
  roles?: Role[];
  /**
   * V1.4 — entity của RBAC matrix. Nếu set, item chỉ hiển thị khi user có
   * BẤT KỲ quyền nào trên entity (`canAny(userRoles, entity)`).
   */
  entity?: RbacEntity;
  /** True → render divider phía trên item này trong sidebar. */
  divider?: boolean;
  /** True → hiển thị mờ, disable click (feature chưa bật). */
  disabled?: boolean;
  /** Nhãn phụ hiển thị trong CommandPalette/tooltip khi disabled. */
  comingSoon?: string;
  /** Số hoặc chuỗi ngắn hiển thị bên phải label (VD: "3"). */
  badge?: number | string;
  /**
   * V1.8 — nhóm hiển thị trong Sidebar (tuỳ chọn).
   * Nếu không set → item rơi vào group "other".
   */
  section?: NavSection;
}

export const NAV_SECTION_LABEL: Record<NavSection, string> = {
  production: "Sản xuất",
  inventory: "Kho & Mua sắm",
  other: "Khác",
};

export const NAV_SECTION_ORDER: NavSection[] = [
  "production",
  "inventory",
  "other",
];

export const NAV_ITEMS: NavItem[] = [
  // --- Sản xuất ---
  {
    href: "/bom",
    label: "BOM Templates",
    icon: Network,
    entity: "bomTemplate",
    section: "production",
  },
  {
    href: "/orders",
    label: "Đơn hàng",
    icon: ClipboardList,
    entity: "salesOrder",
    section: "production",
  },
  {
    href: "/work-orders",
    label: "Lệnh sản xuất",
    icon: Factory,
    entity: "wo",
    section: "production",
  },
  {
    href: "/lot-serial",
    label: "Lắp ráp / Serial",
    icon: Wrench,
    roles: ["admin", "planner", "operator"],
    section: "production",
  },
  // --- Kho & Mua sắm ---
  {
    href: "/items",
    label: "Danh mục vật tư",
    icon: Package,
    entity: "item",
    section: "inventory",
  },
  {
    href: "/suppliers",
    label: "Nhà cung cấp",
    icon: Building2,
    entity: "supplier",
    section: "inventory",
  },
  {
    href: "/procurement/purchase-requests",
    label: "Yêu cầu mua (PR)",
    icon: ShoppingCart,
    entity: "pr",
    roles: ["admin", "planner"],
    section: "inventory",
  },
  {
    href: "/procurement/purchase-orders",
    label: "Đặt hàng (PO)",
    icon: ShoppingCart,
    entity: "po",
    section: "inventory",
  },
  {
    href: "/receiving",
    label: "Nhận hàng",
    icon: Truck,
    roles: ["admin", "warehouse"],
    section: "inventory",
  },
  // --- Khác ---
  {
    href: "/import",
    label: "Nhập Excel",
    icon: FileSpreadsheet,
    roles: ["admin", "planner"],
    section: "other",
  },
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
 * Logic V1.4:
 *   - Nếu item có `entity` → dùng `canAny(userRoles, entity)` (RBAC matrix).
 *   - Nếu chỉ có `roles` → fallback role-match (legacy).
 *   - Nếu không có cả 2 → hiển thị cho mọi user đã đăng nhập.
 *   - Nếu user có CẢ `roles` lẫn `entity` set → AND (phải thoả cả hai).
 *
 * Nếu `userRoles` undefined → giữ toàn bộ (dev/fallback).
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
 */
export function groupNavBySection(
  items: NavItem[],
): Array<{ section: NavSection; label: string; items: NavItem[] }> {
  const map: Record<NavSection, NavItem[]> = {
    production: [],
    inventory: [],
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
