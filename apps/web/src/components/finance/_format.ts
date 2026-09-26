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

/**
 * Số tiền ĐẦY ĐỦ, vd `1.250.000 ₫`. Kế toán cần số chính xác tới đồng — KHÔNG
 * rút gọn "1.3 tr ₫" trong bảng/form (vừa mất độ chính xác, vừa dễ nhầm dấu
 * "." thập phân với dấu phân cách hàng nghìn của vi-VN).
 */
export function fmtVND(n: number | string | null | undefined): string {
  return fmtVNDFull(n);
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
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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
