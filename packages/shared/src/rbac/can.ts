import type { Role } from "../types";
import {
  RBAC_MATRIX,
  type RbacAction,
  type RbacEntity,
} from "./matrix";

/**
 * Kiểm tra user (multi-role) có được thực thi `action` trên `entity` không.
 *
 * Semantics:
 * - Multi-role OR: chỉ cần một role thỏa mãn là true.
 * - Roles empty/undefined/null → false (deny-by-default).
 * - Role không khai báo entity trong matrix → false cho entity đó.
 *
 * @example
 *   can(["planner"], "create", "item")        // true
 *   can(["operator"], "delete", "item")        // false
 *   can(["admin", "operator"], "delete", "wo") // true (admin trumps)
 */
export function can(
  roles: Role[] | null | undefined,
  action: RbacAction,
  entity: RbacEntity,
): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some(
    (r) => RBAC_MATRIX[r]?.[entity]?.includes(action) ?? false,
  );
}

/**
 * Shortcut cho UI nav/sidebar: role có bất kỳ action nào trên entity?
 * Dùng để hiển thị/ẩn menu item mà không cần biết action cụ thể.
 */
export function canAny(
  roles: Role[] | null | undefined,
  entity: RbacEntity,
): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some(
    (r) => (RBAC_MATRIX[r]?.[entity]?.length ?? 0) > 0,
  );
}
