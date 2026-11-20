/**
 * Bảng sản xuất — đếm ngược hạn giao (giờ Asia/Ho_Chi_Minh). THUẦN, có test.
 * Dùng chung trang quản lý /production-board + màn TV /board.
 */

const VN_TZ = "Asia/Ho_Chi_Minh";

/** "Hôm nay" theo giờ Việt Nam dạng YYYY-MM-DD (máy chủ/TV có thể đặt múi giờ khác). */
export function vnTodayYmd(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function ymdToUtcMs(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Số ngày lịch từ hôm nay tới hạn (âm = quá hạn). null nếu hạn không hợp lệ. */
export function daysUntil(deadlineYmd: string, todayYmd: string): number | null {
  const d = ymdToUtcMs(deadlineYmd);
  const t = ymdToUtcMs(todayYmd);
  if (d === null || t === null) return null;
  return Math.round((d - t) / 86_400_000);
}

export type DeadlineTone = "overdue" | "soon" | "normal" | "missing" | "done";

export interface DeadlineCountdown {
  tone: DeadlineTone;
  /** "Còn 5 ngày" / "Hôm nay" / "Quá 2 ngày" / "Chưa có ngày giao"; null khi đã xong. */
  label: string | null;
  days: number | null;
}

const DONE_STATUSES = new Set(["COMPLETED", "DELIVERED"]);

/**
 * - Đã hoàn thành / đã giao → không đếm ngược (tone "done").
 * - Chưa có hạn → "Chưa có ngày giao" (vàng — QC cần điền).
 * - Quá hạn → đỏ "Quá N ngày"; hôm nay → vàng "Hôm nay"; ≤3 ngày → vàng.
 */
export function deadlineCountdown(
  deadline: string | null | undefined,
  status: string,
  todayYmd: string,
): DeadlineCountdown {
  if (DONE_STATUSES.has(status)) return { tone: "done", label: null, days: null };
  if (!deadline) return { tone: "missing", label: "Chưa có ngày giao", days: null };
  const days = daysUntil(deadline, todayYmd);
  if (days === null) return { tone: "missing", label: "Chưa có ngày giao", days: null };
  if (days < 0) return { tone: "overdue", label: `Quá ${-days} ngày`, days };
  if (days === 0) return { tone: "soon", label: "Hôm nay", days };
  return { tone: days <= 3 ? "soon" : "normal", label: `Còn ${days} ngày`, days };
}
