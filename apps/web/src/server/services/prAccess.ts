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

/**
 * TASK-6VIEC Việc 1 — role nào được XUẤT EXCEL phiếu đề xuất vật tư
 * (đơn lẻ `[id]/export-excel` lẫn danh sách/batch `export-excel`).
 * Mọi bộ phận vẫn tạo/xem phiếu của mình bình thường — đây chỉ chặn riêng
 * hành động xuất Excel (PDF giữ nguyên, không đổi). Dùng chung cho
 * server (403 tiếng Việt) + UI (ẩn nút) để không lệch nhau.
 */
const PR_EXPORT_EXCEL_ROLES: Role[] = ["admin", "purchaser", "accountant"];

export function canExportPrExcel(roles: Role[]): boolean {
  return roles.some((r) => PR_EXPORT_EXCEL_ROLES.includes(r));
}
