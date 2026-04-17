/**
 * Format helpers — Việt Nam locale (dd/MM/yyyy, dấu phân cách hàng nghìn).
 * Direction B yêu cầu tabular-nums cho số lượng + SKU trong bảng.
 */

const VN_LOCALE = "vi-VN";

/**
 * Format số có dấu phân cách hàng nghìn.
 * VD: formatNumber(1_250_000.5) → "1.250.000,5"
 */
export function formatNumber(
  value: number | null | undefined,
  locale: string = VN_LOCALE,
  options?: Intl.NumberFormatOptions,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format tiền VND: "1.250.000 ₫".
 */
export function formatCurrencyVN(
  amount: number | null | undefined,
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat(VN_LOCALE, {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format ngày theo pattern.
 * Hỗ trợ các pattern: "dd/MM/yyyy", "dd/MM/yyyy HH:mm", "HH:mm".
 * Pattern khác rơi về toLocaleString vi-VN.
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  pattern: string = "dd/MM/yyyy",
): string {
  if (date === null || date === undefined) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";

  const pad = (n: number) => String(n).padStart(2, "0");
  const dd = pad(d.getDate());
  const MM = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());

  switch (pattern) {
    case "dd/MM/yyyy":
      return `${dd}/${MM}/${yyyy}`;
    case "dd/MM/yyyy HH:mm":
      return `${dd}/${MM}/${yyyy} ${HH}:${mm}`;
    case "HH:mm":
      return `${HH}:${mm}`;
    case "yyyy-MM-dd":
      return `${yyyy}-${MM}-${dd}`;
    default:
      return d.toLocaleString(VN_LOCALE);
  }
}

/**
 * Format SKU — monospace tabular. Component sử dụng class `.font-mono.tabular-nums`.
 * Ở đây chỉ chuẩn hoá: trim, upper-case.
 */
export function formatSku(sku: string | null | undefined): string {
  if (!sku) return "—";
  return sku.trim().toUpperCase();
}

/**
 * Format độ lệch ngày so với hôm nay. Trả về nhãn ngắn.
 * VD: +3d (còn 3 ngày), -1d (quá 1 ngày), today.
 */
export function formatDaysLeft(
  target: Date | string,
  now: Date = new Date(),
): { label: string; overdue: boolean } {
  const d = target instanceof Date ? target : new Date(target);
  const oneDay = 24 * 60 * 60 * 1000;
  const diff = Math.floor((d.getTime() - now.getTime()) / oneDay);
  if (diff === 0) return { label: "hôm nay", overdue: false };
  if (diff > 0) return { label: `còn ${diff}d`, overdue: false };
  return { label: `quá ${Math.abs(diff)}d`, overdue: true };
}
