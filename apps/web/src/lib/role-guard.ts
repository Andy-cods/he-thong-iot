import type { Role } from "@iot/shared";

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
