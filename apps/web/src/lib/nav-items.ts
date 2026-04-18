import {
  AlertCircle,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  Network,
  Package,
  ShoppingCart,
  Shield,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@iot/shared";

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
  /** Nếu có → chỉ hiển thị khi user có ít nhất 1 role khớp. */
  roles?: Role[];
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
  },
  {
    href: "/items/import",
    label: "Nhập Excel",
    icon: FileSpreadsheet,
    roles: ["admin", "planner"],
  },
  {
    href: "/bom",
    label: "BOM",
    icon: Network,
  },
  {
    href: "/orders",
    label: "Đơn hàng",
    icon: ClipboardList,
  },
  {
    href: "/procurement/purchase-requests",
    label: "Yêu cầu mua (PR)",
    icon: ShoppingCart,
    roles: ["admin", "planner"],
  },
  {
    href: "/procurement/purchase-orders",
    label: "Đặt hàng NCC (PO)",
    icon: ShoppingCart,
    roles: ["admin", "planner"],
  },
  {
    href: "/shortage",
    label: "Thiếu hàng",
    icon: AlertCircle,
    roles: ["admin", "planner"],
  },
  {
    href: "/bom/import",
    label: "Nhập BOM Excel",
    icon: FileSpreadsheet,
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
    roles: ["admin", "planner"],
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
 * Nếu `userRoles` undefined → giữ toàn bộ (dev/fallback).
 */
export function filterNavByRoles(
  items: NavItem[],
  userRoles: Role[] | undefined,
): NavItem[] {
  if (!userRoles || userRoles.length === 0) return items;
  return items.filter(
    (it) => !it.roles || it.roles.some((r) => userRoles.includes(r)),
  );
}
