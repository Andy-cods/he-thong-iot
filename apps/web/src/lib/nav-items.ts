import {
  Factory,
  LayoutDashboard,
  Layers,
  Shield,
  ShoppingBag,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { RbacEntity, Role } from "@iot/shared";
import { canAny } from "@iot/shared";

/**
 * Redesign V3 — nav-items registry.
 * Nguồn dữ liệu duy nhất cho Sidebar + CommandPalette + Breadcrumb.
 *
 * Group theo BỘ PHẬN thay vì function. Sau TASK-20260427-025 mỗi bộ phận có
 * 1 hub duy nhất (tabs bên trong) thay vì nhiều entry rời:
 *   - dashboard:   Tổng quan          (/)
 *   - warehouse:   Bộ phận Kho        (/warehouse)
 *   - purchasing:  Bộ phận Mua bán    (/sales — tab Suppliers + PO)
 *   - engineering: Bộ phận Thiết kế   (/engineering — tab BOM + WO + PR)
 *   - operations:  Bộ phận Vận hành   (/operations — tab Assembly + future QC/Maint)
 *   - accounting:  Bộ phận Kế toán    (Coming soon)
 *   - other:       Quản trị           (/admin)
 *
 * @see plans/redesign-v3/{brainstorm,ui-redesign,implementation-plan,addendum-user-answers}.md
 */
export type NavSection =
  | "dashboard"
  | "warehouse"
  | "finance"
  | "engineering"
  | "operations"
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
  /**
   * V3 (TASK-025) — array of entities; item hiển thị nếu user có quyền trên
   * BẤT KỲ entity nào (OR). Dùng cho hub gộp nhiều entity (sales, engineering).
   */
  entities?: RbacEntity[];
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
  finance: "Tài chính & Mua bán",
  engineering: "Bộ phận Thiết kế",
  operations: "Bộ phận Vận hành",
  other: "Quản trị",
};

export const NAV_SECTION_ORDER: NavSection[] = [
  "dashboard",
  "warehouse",
  "finance",
  "engineering",
  "operations",
  "other",
];

/**
 * V3.3 — STRICT phòng ban: mỗi nav tab chỉ hiển thị cho role thuộc phòng ban đó
 * + admin (toàn quyền). User không thuộc bộ phận sẽ KHÔNG thấy tab khác —
 * khớp yêu cầu "chỉ thấy của bộ phận mình + Tổng quan".
 *
 * Tổng quan hiển thị cho mọi user đã đăng nhập.
 * Quản trị chỉ admin.
 */
export const NAV_ITEMS: NavItem[] = [
  // --- Tổng quan (mọi role đã đăng nhập) ---
  {
    href: "/",
    label: "Tổng quan",
    icon: LayoutDashboard,
    section: "dashboard",
  },
  // --- Bộ phận Kho — chỉ warehouse + admin ---
  {
    href: "/warehouse",
    label: "Bộ phận Kho",
    icon: Warehouse,
    roles: ["admin", "warehouse"],
    section: "warehouse",
  },
  // --- Bộ phận Thu mua — chỉ purchaser + admin ---
  {
    href: "/sales",
    label: "Bộ phận Thu mua",
    icon: ShoppingBag,
    roles: ["admin", "purchaser"],
    section: "finance",
  },
  // --- Bộ phận Thiết kế — chỉ planner + admin ---
  {
    href: "/engineering",
    label: "Bộ phận Thiết kế",
    icon: Layers,
    roles: ["admin", "planner"],
    section: "engineering",
  },
  // --- Bộ phận Vận hành — chỉ operator + admin ---
  {
    href: "/operations",
    label: "Bộ phận Vận hành",
    icon: Factory,
    roles: ["admin", "operator"],
    section: "operations",
  },
  // --- Quản trị (chỉ admin) ---
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
 * Logic:
 *   - Nếu item có `entities` → user phải có quyền trên BẤT KỲ entity nào (OR).
 *   - Nếu item có `entity` → dùng `canAny(userRoles, entity)` (RBAC matrix).
 *   - Nếu chỉ có `roles` → fallback role-match (legacy).
 *   - Nếu không có cả 3 → hiển thị cho mọi user đã đăng nhập.
 *   - Nếu user có CẢ `roles` lẫn `entity`/`entities` set → AND.
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
    if (it.entities && it.entities.length > 0) {
      const anyEntity = it.entities.some((e) => canAny(userRoles, e));
      if (!anyEntity) return false;
    } else if (it.entity && !canAny(userRoles, it.entity)) {
      return false;
    }
    if (it.roles && !it.roles.some((r) => userRoles.includes(r))) return false;
    return true;
  });
}

/**
 * Group nav items theo `section`. Items thiếu `section` → rơi vào `other`.
 * Giữ thứ tự item trong mỗi group như trong NAV_ITEMS.
 *
 * Section rỗng (không có item nào sau filter role) sẽ KHÔNG render.
 */
export function groupNavBySection(
  items: NavItem[],
): Array<{ section: NavSection; label: string; items: NavItem[] }> {
  const map: Record<NavSection, NavItem[]> = {
    dashboard: [],
    warehouse: [],
    finance: [],
    engineering: [],
    operations: [],
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
