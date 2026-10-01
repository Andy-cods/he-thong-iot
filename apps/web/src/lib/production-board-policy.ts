import type { Role } from "@iot/shared";

/**
 * V4.4.2 — Việc 2 (Tổng quan Tài chính: đơn giá bán mã hàng Bảng sản xuất).
 *
 * Hàm quyền DUY NHẤT quyết định ai thấy/nhập được đơn giá bán + "Giá trị"
 * (SL × đơn giá) của mã hàng trên Bảng sản xuất — dùng CẢ server (lọc field
 * JSON API, `GET /api/production-board`, `GET .../history`) lẫn client (ẩn/
 * hiện ô nhập trong `BoardItemDialog`, cột "Giá trị" trong bảng quản lý).
 *
 * Phạm vi: admin (Giám đốc) + accountant (Kế toán) + purchaser (Thu mua).
 * QC, planner, operator, warehouse, display (TV xưởng), shareholder KHÔNG
 * thấy giá — kể cả khi họ có quyền đọc/sửa `productionBoard` (vd QC toàn
 * quyền CRUD bảng nhưng không phải vai "xem tài chính đơn hàng").
 *
 * Lưu ý: accountant hiện KHÔNG có quyền entity `productionBoard` trong RBAC
 * matrix (không vào được /production-board) — hàm này vẫn liệt kê accountant
 * vì được dùng ở ngữ cảnh khác (Tổng quan Tài chính tổng hợp số liệu phía
 * server, không đi qua guard productionBoard).
 */
const ORDER_VALUE_ROLES: ReadonlySet<Role> = new Set<Role>([
  "admin",
  "accountant",
  "purchaser",
]);

export function canSeeOrderValue(roles: readonly Role[] | null | undefined): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some((r) => ORDER_VALUE_ROLES.has(r));
}
