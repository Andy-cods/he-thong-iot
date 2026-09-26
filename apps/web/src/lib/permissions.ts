import type { RbacAction, RbacEntity, Role } from "@iot/shared";
import { can } from "@iot/shared";

/**
 * V4.1 AD-19 — override quyền riêng từng user (bảng user_permission_override)
 * ở dạng gọn để truyền xuống client + dùng cho menu / chặn trang.
 * Chỉ các override CÒN HIỆU LỰC (đã lọc expires_at ở server).
 */
export interface PermissionOverrideLite {
  entity: string;
  action: string;
  granted: boolean;
}

/**
 * Cùng quy tắc với `requireCan` / `canForUser` phía server:
 *   1. override DENY → cấm (thắng tất cả),
 *   2. vai trò cho phép → được,
 *   3. override GRANT → được,
 *   4. còn lại → cấm.
 */
export function canWithOverrides(
  roles: Role[] | null | undefined,
  overrides: readonly PermissionOverrideLite[] | null | undefined,
  action: RbacAction,
  entity: RbacEntity,
): boolean {
  const ov = overrides?.find((o) => o.entity === entity && o.action === action);
  if (ov && ov.granted === false) return false;
  if (can(roles, action, entity)) return true;
  return !!ov && ov.granted === true;
}
