import type { Role } from "@iot/shared";

/**
 * V4.10 (TASK-20261118-001) — khoá tài khoản CHUNG của xưởng vệ tinh (role
 * `workshop`) vào đúng module Sản lượng ca. Hàm thuần, dùng chung:
 *   - `(app)/layout.tsx` (redirect trang),
 *   - `lib/route-guard.ts` + `lib/nav-items.ts` (menu / Ctrl+K),
 *   - `server/session.ts` (`requireSession` 403, dashboard routes).
 * Giống mẫu kiosk `display`: admin kiêm workshop thì KHÔNG bị khoá.
 */
export const WORKSHOP_HOME = "/san-luong";

export function isModuleLockedRoles(roles: readonly Role[] | null | undefined): boolean {
  if (!roles) return false;
  return roles.includes("workshop") && !roles.includes("admin");
}

function matchPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}

/** Trang (pathname, có thể kèm query) tài khoản xưởng được mở. */
const WORKSHOP_PAGE_PREFIXES = ["/san-luong", "/me", "/logout"];

export function isWorkshopPathAllowed(path: string): boolean {
  return WORKSHOP_PAGE_PREFIXES.some((p) => matchPrefix(path, p));
}

/**
 * API mà route dùng `requireSession()` (không qua RBAC matrix) — allowlist cho
 * tài khoản xưởng: hồ sơ `/api/me` (đúng đường dẫn này, KHÔNG gồm
 * `/api/me/productivity`), chuông thông báo, Web Push. API Sản lượng ca dùng
 * `requireCan` (matrix) nên không cần nằm đây.
 */
export function isWorkshopApiAllowed(pathname: string): boolean {
  if (pathname === "/api/me") return true;
  return matchPrefix(pathname, "/api/notifications") || matchPrefix(pathname, "/api/push");
}
