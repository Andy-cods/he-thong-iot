/**
 * Helpers định dạng dùng riêng cho phân hệ Tài chính — copy có kiểm soát từ
 * `fmtVND`/`fmtDate` cục bộ trong `POTab.tsx`/`AccountingTab.tsx` (xem
 * plans/v4-finance/wave-2-finance.md §E.4 — phương án tối thiểu, KHÔNG sửa
 * `lib/format.ts` chung để tránh rủi ro thay đổi hành vi các trang cũ đang
 * chạy production).
 *
 * LƯU Ý: numeric(18,2) trả về string qua Drizzle/pg driver — convert Number()
 * trước khi truyền vào các hàm này (xem wave-2-finance.md §C.4).
 */

export function fmtVND(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v) || v === 0) return "0 ₫";
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} tỷ ₫`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} tr ₫`;
  return `${Math.round(v).toLocaleString("vi-VN")} ₫`;
}

/** Không rút gọn — dùng cho input/tooltip cần số chính xác tuyệt đối. */
export function fmtVNDFull(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return "0 ₫";
  return `${Math.round(v).toLocaleString("vi-VN")} ₫`;
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN");
}

export function fmtDateShort(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

/** Input `<input type="date">` cần format yyyy-MM-dd. */
export function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}
