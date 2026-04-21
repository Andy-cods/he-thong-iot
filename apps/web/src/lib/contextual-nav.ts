import {
  AlertCircle,
  ClipboardList,
  Factory,
  FolderTree,
  GitBranch,
  History,
  LayoutGrid,
  Network,
  PackageCheck,
  ShoppingCart,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { RbacEntity, Role } from "@iot/shared";

export interface ContextualNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  entity?: RbacEntity;
  roles?: Role[];
  divider?: boolean;
  /** Badge count hiển thị bên phải label (VD: số orders trong BOM này). */
  badge?: number | string;
}

/**
 * BOM Workspace contextual nav — thay thế global sidebar khi user enter
 * `/bom/[id]/*`. Mỗi item link đến sub-route với BOM ID đã embed vào path.
 *
 * Counts được load phía server/client qua `/api/bom/[id]/summary` (Phase 5
 * aggregate endpoint) và inject vào `badge` trước khi render.
 */
export function buildBomContextNav(
  bomId: string,
  counts?: Partial<Record<string, number>>,
): ContextualNavItem[] {
  return [
    {
      // V1.7 — "/bom/[id]" redirect sang /grid, nên entry mặc định = Bảng Grid.
      href: `/bom/${bomId}/grid`,
      label: "Bảng Grid",
      icon: LayoutGrid,
      entity: "bomTemplate",
    },
    {
      href: `/bom/${bomId}/tree`,
      label: "Cây linh kiện",
      icon: Network,
      entity: "bomTemplate",
    },
    {
      href: `/bom/${bomId}/orders`,
      label: "Đơn hàng",
      icon: ClipboardList,
      entity: "salesOrder",
      badge: counts?.orders,
    },
    {
      href: `/bom/${bomId}/work-orders`,
      label: "Lệnh sản xuất",
      icon: Factory,
      entity: "wo",
      badge: counts?.workOrders,
    },
    {
      href: `/bom/${bomId}/procurement`,
      label: "Mua sắm",
      icon: ShoppingCart,
      entity: "po",
      badge: counts?.procurement,
    },
    {
      href: `/bom/${bomId}/shortage`,
      label: "Thiếu hàng",
      icon: AlertCircle,
      roles: ["admin", "planner"],
      badge: counts?.shortage,
    },
    {
      href: `/bom/${bomId}/eco`,
      label: "ECO",
      icon: GitBranch,
      entity: "eco",
      roles: ["admin", "planner"],
      badge: counts?.eco,
    },
    {
      href: `/bom/${bomId}/assembly`,
      label: "Lắp ráp",
      icon: Wrench,
      entity: "wo",
      badge: counts?.assembly,
    },
    {
      href: `/bom/${bomId}/history`,
      label: "Lịch sử",
      icon: History,
      entity: "bomTemplate",
      divider: true,
    },
  ];
}

/**
 * Check xem pathname có phải đang ở trong BOM workspace không.
 * Loại trừ các sub-route KHÔNG chạy workspace (new, import).
 */
export function matchBomWorkspace(pathname: string): {
  isWorkspace: boolean;
  bomId: string | null;
} {
  // UUID v4 pattern OR wildcard cho id
  const m = /^\/bom\/([0-9a-f-]{8,})(\/|$)/.exec(pathname);
  if (!m) return { isWorkspace: false, bomId: null };
  const id = m[1]!;
  if (id === "new" || id === "import") {
    return { isWorkspace: false, bomId: null };
  }
  return { isWorkspace: true, bomId: id };
}

/** Icon cho entry "Tổng quan" của BOM workspace — reused bởi ContextualSidebar header. */
export { PackageCheck as BomWorkspaceIcon };
