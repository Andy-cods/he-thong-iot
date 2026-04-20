import {
  AlertCircle,
  Building2,
  ClipboardList,
  Factory,
  FileSpreadsheet,
  GitBranch,
  LayoutDashboard,
  Network,
  Package,
  ShoppingCart,
  Shield,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { RbacEntity, Role } from "@iot/shared";
import { canAny } from "@iot/shared";

/**
 * Direction B — nav-items registry.
 * Nguồn dữ liệu duy nhất cho Sidebar + CommandPalette + Breadcrumb.
 * Role filter: item không có `roles` → hiển thị cho tất cả.
 *
 * @see docs design-spec §2.3 AppShell + §3.2 Sidebar.
 */
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
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Tổng quan",
    icon: LayoutDashboard,
    roles: ["admin", "planner"],
  },
  {
    href: "/items",
    label: "Danh mục vật tư",
    icon: Package,
    entity: "item",
  },
  {
    href: "/import",
    label: "Nhập Excel",
    icon: FileSpreadsheet,
    roles: ["admin", "planner"],
  },
  {
    href: "/bom",
    label: "BOM",
    icon: Network,
    entity: "bomTemplate",
  },
  {
    href: "/orders",
    label: "Đơn hàng",
    icon: ClipboardList,
    entity: "salesOrder",
  },
  {
    href: "/procurement/purchase-requests",
    label: "Yêu cầu mua (PR)",
    icon: ShoppingCart,
    entity: "pr",
    roles: ["admin", "planner"],
  },
  {
    href: "/procurement/purchase-orders",
    label: "Đặt hàng NCC (PO)",
    icon: ShoppingCart,
    entity: "po",
  },
  {
    href: "/shortage",
    label: "Thiếu hàng",
    icon: AlertCircle,
    roles: ["admin", "planner"],
  },
  {
    href: "/work-orders",
    label: "Lệnh sản xuất (WO)",
    icon: Factory,
    entity: "wo",
  },
  {
    href: "/eco",
    label: "ECO",
    icon: GitBranch,
    entity: "eco",
    roles: ["admin", "planner"],
  },
  {
    href: "/admin",
    label: "Quản trị",
    icon: Shield,
    roles: ["admin"],
    divider: true,
  },
  {
    href: "/suppliers",
    label: "Nhà cung cấp",
    icon: Building2,
    entity: "supplier",
  },
  {
    href: "/receiving",
    label: "Nhận hàng",
    icon: Truck,
    roles: ["admin", "warehouse"],
    divider: true,
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
