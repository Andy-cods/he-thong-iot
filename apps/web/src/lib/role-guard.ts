import type { RbacAction, RbacEntity, Role } from "@iot/shared";
import { can as rbacCan, canAny as rbacCanAny } from "@iot/shared";

/**
 * Role guard helper — client-side usage (hooks, components).
 * Server-side dùng `server/session.ts > requireSession`.
 *
 * hasRole(userRoles, 'admin') — true nếu user có role 'admin'.
 * hasRole(userRoles, ['admin', 'planner']) — true nếu user có ít nhất 1 trong mảng.
 *
 * Admin nguyên tắc KHÔNG tự động bypass. Phía backend guard-admin sẽ
 * reject nếu không có role 'admin' explicit — giữ consistency.
 */
export function hasRole(
  userRoles: Role[] | undefined | null,
  required: Role | Role[],
): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  const req = Array.isArray(required) ? required : [required];
  if (req.length === 0) return true;
  return req.some((r) => userRoles.includes(r));
}

export function isAdmin(userRoles: Role[] | undefined | null): boolean {
  return hasRole(userRoles, "admin");
}

/**
 * Client-side `useCan` — dùng trong component React để ẩn/hiện UI element.
 * Thực ra chỉ là pure function (không hook state) — tên `use*` theo convention
 * của V1.4 để phân biệt client context; không đăng ký hook Reactôi.
 *
 * @example
 *   if (useCan(userRoles, "create", "item")) return <Button>Tạo SKU</Button>;
 */
export function useCan(
  userRoles: Role[] | undefined | null,
  action: RbacAction,
  entity: RbacEntity,
): boolean {
  return rbacCan(userRoles ?? [], action, entity);
}

/** Shortcut: hiển thị nav entry nếu user có BẤT KỲ quyền nào trên entity. */
export function useCanAny(
  userRoles: Role[] | undefined | null,
  entity: RbacEntity,
): boolean {
  return rbacCanAny(userRoles ?? [], entity);
}

/** Parse role string (e.g. "admin,planner") từ UserMenuUser.role field. */
export function parseRolesString(raw: string | undefined): Role[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is Role =>
      ["admin", "planner", "warehouse", "operator"].includes(r),
    );
}
