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

/**
 * V4.5 QA-C P2-1/QA-D P1-01 — giới hạn hợp lý cho đơn giá bán + SL kế hoạch
 * trên Bảng sản xuất. Trước đây không giới hạn: 1 dòng gõ nhầm (vd thêm vài
 * số 0 vào đơn giá, 999.999.999.999đ × 99.999) làm ô "Đang sản xuất" ở Tổng
 * quan Tài chính nhảy lên mức phi thực tế (~99.999 nghìn tỷ tỷ đồng), không
 * cảnh báo. Dùng CHUNG cho zod schema (API tạo/sửa mã hàng) + input UI
 * (`max` attribute, xem `BoardItemDialog.tsx`).
 */
export const BOARD_UNIT_PRICE_MAX = 10_000_000_000; // 10 tỷ ₫/đơn vị
export const BOARD_QTY_MAX = 10_000_000; // 10 triệu đơn vị

export const BOARD_UNIT_PRICE_MAX_MESSAGE = `Đơn giá tối đa ${BOARD_UNIT_PRICE_MAX.toLocaleString("vi-VN")} ₫.`;
export const BOARD_QTY_MAX_MESSAGE = `Số lượng tối đa ${BOARD_QTY_MAX.toLocaleString("vi-VN")}.`;
