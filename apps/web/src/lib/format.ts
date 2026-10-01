/**
 * Format helpers — Việt Nam locale (dd/MM/yyyy, dấu phân cách hàng nghìn).
 * Direction B yêu cầu tabular-nums cho số lượng + SKU trong bảng.
 *
 * V4.1 UI-13..16 (Đợt 6B): nguồn định dạng DUY NHẤT cho tiền / số lượng / ngày
 * giờ / phần trăm. Mọi ngày giờ hiển thị theo giờ Việt Nam (Asia/Ho_Chi_Minh)
 * bất kể máy chạy (server Node ở UTC, trình duyệt khác múi giờ) — trước đây
 * Nhật ký hiện giờ UTC `03:52:19 27/09/26`.
 * Tiền hiển thị bằng font thường + `tabular-nums` (KHÔNG `font-mono`).
 */

const VN_LOCALE = "vi-VN";
export const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

type Numeric = number | string | null | undefined;

/** V4.1 UI-13: numeric(18,x) từ pg về dạng string → đổi sang number an toàn. */
function toNum(value: Numeric): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

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
  return formatMoney(amount);
}

export interface FormatMoneyOptions {
  /** "₫" (mặc định) hoặc "none" = chỉ số (cột đã ghi "(VND)" ở tiêu đề). */
  unit?: "₫" | "none";
  /** true → luôn in dấu "+" cho số dương (sổ quỹ thu/chi). */
  sign?: boolean;
  /** Chuỗi trả về khi thiếu giá trị. Mặc định "0 ₫" / "0" (giữ hành vi cũ các bảng tiền). */
  empty?: string;
}

/**
 * V4.1 UI-13: tiền ĐỦ SỐ, làm tròn đồng, dấu chấm nghìn vi-VN: "1.234.567 ₫".
 * Âm dùng dấu trừ thật "−" (khớp `formatVndFull` của Tài chính Đợt 3).
 */
export function formatMoney(value: Numeric, opts: FormatMoneyOptions = {}): string {
  const unit = opts.unit ?? "₫";
  const n = toNum(value);
  if (n === null) return opts.empty ?? (unit === "none" ? "0" : "0 ₫");
  const rounded = Math.round(n);
  // Math.round(-0.4) = -0 → coi như 0, không in "−0".
  const abs = Math.abs(rounded).toLocaleString(VN_LOCALE);
  const sign = rounded < 0 ? "−" : opts.sign && rounded > 0 ? "+" : "";
  return unit === "none" ? `${sign}${abs}` : `${sign}${abs} ₫`;
}

/**
 * V4.1 UI-13: tiền rút gọn CHỈ cho thẻ KPI / trục biểu đồ: "1,5 tr ₫", "2,3 tỷ ₫"
 * (dấu PHẨY thập phân — "1.5 tr" dễ đọc nhầm thành 1.500).
 */
export function formatMoneyShort(value: Numeric): string {
  const n = toNum(value);
  if (n === null || n === 0) return "0 ₫";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  const one = (x: number) =>
    x.toLocaleString(VN_LOCALE, { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  if (abs >= 1_000_000_000) return `${sign}${one(abs / 1_000_000_000)} tỷ ₫`;
  if (abs >= 1_000_000) return `${sign}${one(abs / 1_000_000)} tr ₫`;
  return `${sign}${Math.round(abs).toLocaleString(VN_LOCALE)} ₫`;
}

/**
 * V4.1 UI-14: số lượng — bỏ số 0 thừa sau dấu phẩy ("12,5000" → "12,5"),
 * tối đa `maxDecimals` chữ số lẻ (mặc định 4, khớp numeric(18,4) ở kho).
 * Có `uom` → nối ĐVT viết HOA thống nhất ("Pcs"/"SET"/"Set" → "PCS"/"SET").
 * VD: formatQty(1000, "pcs") → "1.000 PCS"; formatQty("2.5000") → "2,5".
 */
export function formatQty(
  value: Numeric,
  uom?: string | null,
  maxDecimals = 4,
): string {
  const n = toNum(value);
  if (n === null) return "—";
  const num = n.toLocaleString(VN_LOCALE, {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  });
  const u = formatUom(uom);
  return u ? `${num} ${u}` : num;
}

/** V4.1 UI-14: ĐVT viết HOA thống nhất; rỗng → "". */
export function formatUom(uom: string | null | undefined): string {
  return (uom ?? "").trim().toUpperCase();
}

/**
 * V4.1 UI-16: phần trăm. Mặc định nhận TỈ LỆ (0.125 → "12,5%");
 * `{ ratio: false }` khi giá trị đã là phần trăm (12.5 → "12,5%").
 */
export function formatPercent(
  value: Numeric,
  opts: { ratio?: boolean; maxDecimals?: number } = {},
): string {
  const n = toNum(value);
  if (n === null) return "—";
  const pct = opts.ratio === false ? n : n * 100;
  return `${pct.toLocaleString(VN_LOCALE, {
    maximumFractionDigits: opts.maxDecimals ?? 1,
    minimumFractionDigits: 0,
  })}%`;
}

interface VnParts {
  dd: string;
  MM: string;
  yyyy: string;
  HH: string;
  mm: string;
  ss: string;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * V4.1 UI-15: tách thành phần ngày giờ THEO GIỜ VIỆT NAM.
 * Việt Nam không có giờ mùa hè → UTC+7 cố định: cộng offset rồi đọc getUTC*
 * (không phụ thuộc múi giờ/ICU của môi trường). Chuỗi "YYYY-MM-DD" (cột date)
 * giữ nguyên ngày, không qua múi giờ (tránh lùi/tiến 1 ngày).
 */
function vnParts(date: Date | string | number | null | undefined): VnParts | null {
  if (date === null || date === undefined || date === "") return null;
  if (typeof date === "string") {
    const m = DATE_ONLY_RE.exec(date);
    if (m) return { yyyy: m[1]!, MM: m[2]!, dd: m[3]!, HH: "00", mm: "00", ss: "00" };
  }
  const d = date instanceof Date ? date : new Date(date);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  const v = new Date(t + VN_OFFSET_MS);
  return {
    dd: pad(v.getUTCDate()),
    MM: pad(v.getUTCMonth() + 1),
    yyyy: String(v.getUTCFullYear()),
    HH: pad(v.getUTCHours()),
    mm: pad(v.getUTCMinutes()),
    ss: pad(v.getUTCSeconds()),
  };
}

/**
 * Format ngày theo pattern — LUÔN theo giờ Việt Nam.
 * Hỗ trợ: "dd/MM/yyyy", "dd/MM/yyyy HH:mm", "dd/MM/yyyy HH:mm:ss", "dd/MM HH:mm",
 * "dd/MM", "HH:mm", "HH:mm:ss", "yyyy-MM-dd". Pattern khác → "dd/MM/yyyy HH:mm".
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  pattern: string = "dd/MM/yyyy",
): string {
  const p = vnParts(date);
  if (!p) return "—";
  switch (pattern) {
    case "dd/MM/yyyy":
      return `${p.dd}/${p.MM}/${p.yyyy}`;
    case "dd/MM/yyyy HH:mm":
      return `${p.dd}/${p.MM}/${p.yyyy} ${p.HH}:${p.mm}`;
    case "dd/MM/yyyy HH:mm:ss":
      return `${p.dd}/${p.MM}/${p.yyyy} ${p.HH}:${p.mm}:${p.ss}`;
    case "dd/MM HH:mm":
      return `${p.dd}/${p.MM} ${p.HH}:${p.mm}`;
    case "dd/MM":
      return `${p.dd}/${p.MM}`;
    case "HH:mm":
      return `${p.HH}:${p.mm}`;
    case "HH:mm:ss":
      return `${p.HH}:${p.mm}:${p.ss}`;
    case "yyyy-MM-dd":
      return `${p.yyyy}-${p.MM}-${p.dd}`;
    default:
      return `${p.dd}/${p.MM}/${p.yyyy} ${p.HH}:${p.mm}`;
  }
}

/** V4.1 UI-15: "27/09/2026 10:52" (giờ VN). `seconds` → thêm ":ss". */
export function formatDateTime(
  date: Date | string | number | null | undefined,
  opts: { seconds?: boolean } = {},
): string {
  return formatDate(date, opts.seconds ? "dd/MM/yyyy HH:mm:ss" : "dd/MM/yyyy HH:mm");
}

/** Bí danh theo tên trong kế hoạch Đợt 6 (X3). */
export const formatDateTimeVN = formatDateTime;

/**
 * V4.1 UI-15: giá trị cho `<input type="date">` (yyyy-MM-dd) theo ngày VN —
 * trước 7h sáng `toISOString()` ra ngày hôm qua.
 */
export function toLocalDateInput(date: Date | string | number = new Date()): string {
  return formatDate(date, "yyyy-MM-dd");
}

/**
 * V4.1 UI-15: "5 phút trước" / "3 giờ trước" / "2 ngày trước"; ≥ 7 ngày → dd/MM/yyyy.
 * `justNow` = chữ cho < 1 phút (mặc định "vừa xong").
 */
export function formatRelative(
  date: Date | string | number | null | undefined,
  opts: { now?: number; justNow?: string } = {},
): string {
  if (date === null || date === undefined || date === "") return "—";
  const d = date instanceof Date ? date : new Date(date);
  const diff = (opts.now ?? Date.now()) - d.getTime();
  if (Number.isNaN(diff)) return "—";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return opts.justNow ?? "vừa xong";
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ngày trước`;
  return formatDate(d, "dd/MM/yyyy");
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
 * V4.4 A4 — cặp helper thuần cho `DateField` (components/ui/date-field.tsx):
 * ô nhập ngày dd/MM/yyyy gõ tay, thay `<input type="date">` native hiện
 * placeholder theo locale máy (mm/dd/yyyy ở máy tiếng Anh).
 */

/** "dd/MM/yyyy" hợp lệ (kiểm cả ngày thật trong tháng/năm, VD 31/02 → null) → ISO "yyyy-MM-dd". */
export function parseVnDate(display: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m as unknown as [string, string, string, string];
  const d = Number(dd);
  const mo = Number(mm);
  const y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/** Tự chèn "/" khi gõ số liên tục: "01012026" → "01/01/2026". */
export function autoFormatVnDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(
    (p) => p.length > 0,
  );
  return parts.join("/");
}

/**
 * V4.4 (NHÓM G) — 1 vài endpoint báo cáo năng suất trả timestamp ĐÃ quy đổi
 * giờ VN thành chuỗi "YYYY-MM-DD HH:mm" ở SQL (`to_char(... AT TIME ZONE
 * 'Asia/Ho_Chi_Minh', ...)`), khác hẳn ISO instant mà `formatDate`/`vnParts`
 * ở trên xử lý (chúng CỘNG THÊM +7h — nếu áp cho chuỗi đã là giờ VN sẵn sẽ bị
 * lệch giờ gấp đôi). Hàm này CHỈ đổi thứ tự hiển thị "dd/MM/yyyy HH:mm" cho
 * đúng quy ước Việt Nam, không cộng/trừ giờ. Chuỗi lạ (không đúng khuôn) trả
 * nguyên văn để không vỡ UI.
 */
export function formatVnWallClock(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  if (!m) return value;
  const [, y, mo, d, h, mi] = m as unknown as [string, string, string, string, string, string];
  return `${d}/${mo}/${y} ${h}:${mi}`;
}
