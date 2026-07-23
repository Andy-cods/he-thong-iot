/**
 * V3.13 — Kho lưu trữ phiếu theo "thư mục ngày".
 *
 * Dùng chung cho 2 module: Yêu cầu vật tư (material-requests) + Đề xuất mua
 * vật tư (purchase-requests). Backend trả về các "bucket" theo ngày
 * (`YYYY-MM-DD` theo giờ Asia/Ho_Chi_Minh) kèm số phiếu + tách nhỏ trạng thái.
 * Client gom tiếp thành cấp Tháng → Ngày (dữ liệu nhỏ: 1 dòng/ngày).
 */

/** Một ngày có phiếu — server trả về (đã group theo ngày, tz +07). */
export interface DayBucket {
  /** `YYYY-MM-DD` theo Asia/Ho_Chi_Minh. */
  day: string;
  count: number;
  /** Đếm theo từng trạng thái (key = status của module tương ứng). */
  statuses: Record<string, number>;
}

/** Một tháng gom từ nhiều DayBucket. */
export interface MonthBucket {
  /** `YYYY-MM`. */
  month: string;
  count: number;
  statuses: Record<string, number>;
  days: DayBucket[];
}

function addStatuses(
  into: Record<string, number>,
  from: Record<string, number>,
): void {
  for (const [k, v] of Object.entries(from)) {
    into[k] = (into[k] ?? 0) + v;
  }
}

/**
 * Gom danh sách ngày → danh sách tháng (mới nhất trước). Ngày trong mỗi tháng
 * cũng sắp mới nhất trước.
 */
export function groupDaysByMonth(days: DayBucket[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const d of days) {
    const month = d.day.slice(0, 7); // YYYY-MM
    let m = map.get(month);
    if (!m) {
      m = { month, count: 0, statuses: {}, days: [] };
      map.set(month, m);
    }
    m.count += d.count;
    addStatuses(m.statuses, d.statuses);
    m.days.push(d);
  }
  const months = [...map.values()];
  for (const m of months) {
    m.days.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  }
  months.sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
  return months;
}

const MONTH_NAMES = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

const WEEKDAY_NAMES = [
  "Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy",
];

/** `2026-07` → "Tháng 7 / 2026". */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const idx = Number(m) - 1;
  return `${MONTH_NAMES[idx] ?? `Tháng ${m}`} / ${y}`;
}

/** `2026-07` → "Tháng 7 2026" (ngắn, cho breadcrumb). */
export function formatMonthShort(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? `Tháng ${m}`} ${y}`;
}

/** `2026-07-17` → "17/07". */
export function formatDayNum(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

/** `2026-07-17` → "17/07/2026". */
export function formatDayFull(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * `2026-07-17` → "Thứ Sáu". Tính thứ bằng công thức Zeller-lite qua UTC để
 * không lệ thuộc timezone client (day string đã là ngày theo +07).
 */
export function formatWeekday(day: string): string {
  const parts = day.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  // Dùng UTC noon để tránh lệch ngày do DST/timezone.
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return WEEKDAY_NAMES[dow] ?? "";
}
