/**
 * V4.4 fix P1 — "Phiếu kiểm kê nhiều dòng kẹt vĩnh viễn ở DRAFT" (xem
 * plans/v4.4-ui/REGRESSION.md mục 3.3).
 *
 * NGUYÊN NHÂN GỐC: ô "Số đếm" (StocktakeSessionSheet.tsx) gửi
 * `countedQty: Number(raw)` lên server mỗi khi ô KHÔNG rỗng. Nếu người dùng
 * gõ dấu PHẨY thập phân kiểu Việt ("12,5" — rất tự nhiên, nhưng
 * `Number("12,5")` = `NaN`), hoặc gõ nhầm ký tự khác không parse được thành
 * số, thì `JSON.stringify({ countedQty: NaN })` tự động biến `NaN` thành
 * `null` (hành vi chuẩn của `JSON.stringify` — không throw, không báo lỗi).
 * Server nhận `null` và hiểu là "xoá số đã đếm" (zod `nullable()` CHO PHÉP
 * giá trị này) → âm thầm lưu `counted_qty = NULL`, không có lỗi nào trả về.
 * Ô nhập trên UI vẫn hiển thị y nguyên chuỗi người dùng gõ (VD "12,5") nên
 * trông như "đã đếm" (đủ điều kiện bật nút "Gửi duyệt" ở phía client), nhưng
 * DB thực tế vẫn `NULL` → bấm "Gửi duyệt" luôn bị chặn bởi
 * `NOT_FULLY_COUNTED` (409) không rõ lý do, phiên kẹt DRAFT vĩnh viễn. Càng
 * nhiều dòng (60+) thì xác suất gặp ít nhất 1 dòng gõ kiểu này càng cao.
 *
 * SỬA: parse THUẦN ở đây — tự đổi "," → "." (chấp nhận thói quen gõ số thập
 * phân kiểu Việt), và PHÂN BIỆT RÕ 3 trạng thái: rỗng (chưa đếm — hợp lệ,
 * cho phép xoá), số hợp lệ (>= 0, hữu hạn), hoặc KHÔNG HỢP LỆ (chuỗi có nội
 * dung nhưng không parse được) — trường hợp cuối KHÔNG ĐƯỢC âm thầm gửi
 * `null` lên server, phải chặn ngay ở client + báo rõ.
 */
export type StocktakeCountParseResult =
  | { ok: true; value: number | null }
  | { ok: false };

export function parseStocktakeCountInput(raw: string): StocktakeCountParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  // Thói quen gõ số thập phân kiểu Việt dùng dấu phẩy — đổi về dấu chấm
  // trước khi parse (chỉ đổi dấu phẩy ĐẦU TIÊN, tránh "1,2,3" lọt qua).
  const normalized = trimmed.includes(",") ? trimmed.replace(",", ".") : trimmed;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

/** true nếu ô nhập có nội dung nhưng KHÔNG parse được thành số hợp lệ (cần báo lỗi, không phải "chưa đếm"). */
export function isInvalidStocktakeCountInput(raw: string): boolean {
  return raw.trim() !== "" && !parseStocktakeCountInput(raw).ok;
}
