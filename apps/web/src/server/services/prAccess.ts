import type { Role } from "@iot/shared";

/**
 * V3.9 — Ownership PR: role nào xem được TẤT CẢ phiếu.
 * operator/qc (không nằm trong list) chỉ xem phiếu requestedBy = chính mình.
 * QĐ-3: warehouse giữ nguyên xem tất cả (hiện trạng V3.7.55).
 * accountant xem tất cả để tải PDF/Excel gửi thanh toán.
 */
const PR_VIEW_ALL_ROLES: Role[] = [
  "admin",
  "planner",
  "purchaser",
  "warehouse",
  "accountant",
];

export function canViewAllPRs(roles: Role[]): boolean {
  return roles.some((r) => PR_VIEW_ALL_ROLES.includes(r));
}
