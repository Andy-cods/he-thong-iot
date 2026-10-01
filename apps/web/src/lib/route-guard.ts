import type { RbacEntity, Role } from "@iot/shared";
import { canWithOverrides, type PermissionOverrideLite } from "./permissions";

/**
 * V3.3 — Route → quyền truy cập trang (guard phía server trong `(app)/layout.tsx`).
 * V4.1 AD-17/AD-19 — tách khỏi layout thành hàm thuần để:
 *   - menu (lib/nav-items.ts) + Ctrl+K dùng CHUNG quy tắc với chặn trang,
 *   - override quyền riêng từng user có tác dụng ở menu + trang (không chỉ API).
 *
 * Quy tắc 1 mục (khớp prefix ĐẦU TIÊN theo thứ tự mảng — mục cụ thể đặt trước):
 *   - `roles`: user phải thuộc ít nhất 1 vai trò (phân quyền theo BỘ PHẬN).
 *   - `entities`: user phải ĐỌC được ít nhất 1 entity sau khi áp override
 *     (DENY thắng; GRANT mở thêm). Mục chỉ có `entities` (không `roles`) thì
 *     override GRANT đủ để mở trang.
 *   - Admin bỏ qua mọi guard (trừ khi gọi với `adminBypass=false`).
 *
 * Chủ ý KISS: GRANT không mở trang HUB của bộ phận khác (vì mục có `roles`) —
 * hub lọc tab theo vai trò; override GRANT dùng cho thao tác API bên trong trang
 * user vốn đã vào được. DENY thì luôn ẩn menu + chặn trang tương ứng.
 */
export interface RouteGuardRule {
  prefix: string;
  roles?: Role[];
  entities?: RbacEntity[];
}

export const ROUTE_GUARDS: RouteGuardRule[] = [
  { prefix: "/admin", roles: ["admin"] },
  // V4.3 mục 4.3 — gộp `/qc-inbound` vào tab Kho "Chờ QC": role `qc` cần vào
  // được `/warehouse?tab=movement&mode=qc`. Thêm entity `qcInspection` (qc CÓ
  // quyền này, KHÔNG có `inventory`) để giữ nguyên chặn admin/warehouse như cũ
  // qua entity `inventory`.
  {
    prefix: "/warehouse",
    roles: ["admin", "warehouse", "qc"],
    entities: ["inventory", "qcInspection"],
  },
  // TASK-20261001 — Tài chính đã TÁCH ra hub riêng `/finance` (mục menu cấp
  // 1 "Tài chính - Kế toán"). `/sales` giờ chỉ còn PO + Nhà cung cấp → bỏ
  // accountant/shareholder/entity `finance` (trước đây mở cho họ để vào tab
  // Tài chính con của /sales — nay dùng `/finance`).
  {
    prefix: "/sales",
    roles: ["admin", "purchaser"],
    entities: ["po", "supplier"],
  },
  // V3.7.57 — BOM list mở cho mọi bộ phận xem (read-only cho non-planner).
  // V3.9 — qc + accountant vào /engineering để dùng tab "Đề xuất vật tư" (PR).
  {
    prefix: "/engineering",
    roles: ["admin", "planner", "warehouse", "operator", "purchaser", "qc", "accountant"],
    entities: ["bomTemplate", "pr", "wo"],
  },
  { prefix: "/operations", roles: ["admin", "operator"], entities: ["wo"] },
  {
    prefix: "/bom",
    roles: ["admin", "planner", "warehouse", "operator", "purchaser"],
    entities: ["bomTemplate"],
  },
  { prefix: "/work-orders", roles: ["admin", "planner", "operator"], entities: ["wo"] },
  // V4.1 AD-19 — trang PO chi tiết gate theo `po`, trang đề xuất theo `pr`.
  {
    prefix: "/procurement/purchase-orders",
    roles: ["admin", "planner", "purchaser", "operator", "warehouse", "qc", "accountant"],
    entities: ["po"],
  },
  // V3.7.55/V3.9 — mọi bộ phận (trừ kiosk) lập Đề xuất vật tư.
  {
    prefix: "/procurement",
    roles: ["admin", "planner", "purchaser", "operator", "warehouse", "qc", "accountant"],
    entities: ["pr"],
  },
  { prefix: "/receiving", roles: ["admin", "warehouse"], entities: ["po"] },
  { prefix: "/assembly", roles: ["admin", "operator"], entities: ["wo"] },
  // V4.1 Đợt 1c (D6) — route giữ cho link thông báo/phiếu xuất (menu đã bỏ).
  {
    prefix: "/material-requests",
    roles: ["admin", "planner", "operator", "warehouse"],
    entities: ["materialRequest"],
  },
  // V3.8/V4.0 — Bảng sản xuất: admin + qc nhập liệu, shareholder xem.
  {
    prefix: "/production-board",
    roles: ["admin", "qc", "shareholder"],
    entities: ["productionBoard"],
  },
  // V4.1 Đợt 1a — màn Chờ QC nhập kho.
  { prefix: "/qc-inbound", roles: ["admin", "qc", "warehouse"], entities: ["qcInspection"] },
  // TASK-20261001 — hub "Tài chính - Kế toán" riêng (trước đây chỉ redirect
  // sang /sales?tab=fin-*, nay là trang thật — xem finance/page.tsx).
  { prefix: "/finance", roles: ["admin", "accountant", "shareholder"], entities: ["finance"] },
  // V4.1 AD-16 — trang NCC chi tiết: ai ĐỌC được NCC (purchaser, planner, kho,
  // kế toán từ Đợt 3…) đều vào được — khớp API /api/suppliers/* (read:supplier).
  // Trước đây không có guard nên người không có quyền vào trang trắng lỗi 403.
  { prefix: "/suppliers", entities: ["supplier"] },
  // /notifications, /items, /orders, /, /me → không guard
];

function matchPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}

export function findRouteGuard(path: string): RouteGuardRule | null {
  return ROUTE_GUARDS.find((g) => matchPrefix(path, g.prefix)) ?? null;
}

/** true nếu user được vào `path` (pathname, có thể kèm query). */
export function isRouteAllowed(
  path: string,
  roles: Role[],
  overrides: readonly PermissionOverrideLite[] = [],
): boolean {
  if (roles.includes("admin")) return true;
  const g = findRouteGuard(path);
  if (!g) return true;
  if (g.roles && !g.roles.some((r) => roles.includes(r))) return false;
  if (g.entities && g.entities.length > 0) {
    return g.entities.some((e) => canWithOverrides(roles, overrides, "read", e));
  }
  return true;
}
