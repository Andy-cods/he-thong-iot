/**
 * Helpers định dạng dùng riêng cho phân hệ Tài chính.
 *
 * LƯU Ý: numeric(18,2) trả về string qua Drizzle/pg driver — convert Number()
 * trước khi truyền vào các hàm này (xem wave-2-finance.md §C.4).
 *
 * V4.1 Đợt 3 (UI): kế toán cần SỐ ĐỦ trong bảng và dòng tổng → `fmtVND` nay
 * KHÔNG rút gọn nữa ("1.5 tr ₫" dấu chấm dễ đọc nhầm thành 1.500 ₫). Rút gọn
 * chỉ còn ở thẻ KPI (`fmtVNDShort`) và trục biểu đồ, dùng dấu phẩy thập phân.
 */
import { formatVndFull, vnToday } from "@/lib/finance";

/** Tiền đủ số: 12.500.000 ₫ — dùng cho ô bảng, dòng tổng, form. */
export function fmtVND(n: number | string | null | undefined): string {
  return formatVndFull(n);
}

/** Giữ tên cũ cho chỗ đang import — cùng nghĩa với `fmtVND`. */
export const fmtVNDFull = fmtVND;

/** Số rút gọn kiểu Việt: 1,5 tr · 2,3 tỷ · 850 N (dấu phẩy thập phân). */
export function fmtCompactVN(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  const one = (x: number) =>
    x.toLocaleString("vi-VN", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  if (abs >= 1_000_000_000) return `${sign}${one(abs / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${sign}${one(abs / 1_000_000)} tr`;
  if (abs >= 1_000) return `${sign}${one(abs / 1_000)} N`;
  return `${sign}${Math.round(abs).toLocaleString("vi-VN")}`;
}

/** CHỈ cho thẻ KPI (không dùng trong bảng): 12,5 tr ₫. */
export function fmtVNDShort(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v) || v === 0) return "0 ₫";
  return `${fmtCompactVN(v)} ₫`;
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  // 'YYYY-MM-DD' → dd/mm/yyyy trực tiếp (không qua Date để khỏi lệch múi giờ).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function fmtDateShort(s: string | null | undefined): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[3]}/${m[2]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

/**
 * Input `<input type="date">` cần format yyyy-MM-dd.
 * V4.1 TC-13 — theo giờ Việt Nam (trước 7h sáng `toISOString()` ra ngày hôm qua).
 */
export function toDateInputValue(d: Date): string {
  return vnToday(d);
}

/** Hôm nay (giờ VN) dạng yyyy-MM-dd — giá trị mặc định cho ô ngày trong form. */
export function todayInputValue(): string {
  return vnToday();
}
