/**
 * V4.10 (TASK-20261118-001) — cửa sổ ca làm việc (hàm thuần, dùng chung
 * server/client). Mọi giờ ca là giờ ĐỊA PHƯƠNG của site (mặc định
 * Asia/Ho_Chi_Minh). "Ngày sản xuất" = ngày BẮT ĐẦU ca (ca qua nửa đêm vẫn
 * thuộc ngày bắt đầu). Ca Đông Anh: CA1 08–12, CA2 13–17, CA3 18–22.
 */

export interface ShiftWindowLike {
  id: string;
  code?: string;
  /** "HH:MM" hoặc "HH:MM:SS" (Postgres `time`). */
  startTime: string;
  endTime: string;
  crossesMidnight?: boolean | null;
  sortOrder?: number | null;
}

export const DEFAULT_TZ = "Asia/Ho_Chi_Minh";

/** "08:00" / "08:00:00" → phút từ nửa đêm. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

/** Chuẩn hoá giờ Postgres "08:00:00" → "08:00". */
export function hhmm(t: string): string {
  return t.slice(0, 5);
}

/** Độ dài ca (phút) — Q5: 240' cho mỗi ca Đông Anh. */
export function shiftMinutes(s: Pick<ShiftWindowLike, "startTime" | "endTime" | "crossesMidnight">): number {
  const st = timeToMinutes(s.startTime);
  const et = timeToMinutes(s.endTime);
  return s.crossesMidnight ? et + 1440 - st : et - st;
}

/** "YYYY-MM-DD" ± n ngày (lịch, không phụ thuộc múi giờ). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + n));
  return t.toISOString().slice(0, 10);
}

/** Số ngày giữa 2 ngày lịch (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Ngày + phút-trong-ngày theo giờ địa phương của `tz`. */
export function localParts(instant: Date, tz: string = DEFAULT_TZ): { date: string; minutes: number } {
  const parts: Record<string, string> = {};
  for (const p of dtf(tz).formatToParts(instant)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
  };
}

function offsetMinutes(instant: Date, tz: string): number {
  const parts: Record<string, string> = {};
  for (const p of dtf(tz).formatToParts(instant)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** Giờ địa phương (ngày + "HH:MM") của `tz` → thời điểm UTC. */
export function zonedToUtc(date: string, time: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = date.split("-").map(Number);
  const mins = timeToMinutes(time);
  const naive = Date.UTC(y!, m! - 1, d!, Math.floor(mins / 60), mins % 60);
  const guess = naive - offsetMinutes(new Date(naive), tz) * 60_000;
  return new Date(naive - offsetMinutes(new Date(guess), tz) * 60_000);
}

export function todayInTz(now: Date, tz: string = DEFAULT_TZ): string {
  return localParts(now, tz).date;
}

/** Thời điểm bắt đầu / kết thúc ca của ngày sản xuất `prodDate`. */
export function shiftStartEnd(
  prodDate: string,
  s: Pick<ShiftWindowLike, "startTime" | "endTime" | "crossesMidnight">,
  tz: string = DEFAULT_TZ,
): { start: Date; end: Date } {
  const start = zonedToUtc(prodDate, s.startTime, tz);
  const end = zonedToUtc(s.crossesMidnight ? addDays(prodDate, 1) : prodDate, s.endTime, tz);
  return { start, end };
}

export type ShiftPhase = "upcoming" | "running" | "ended";

export function shiftPhase(
  prodDate: string,
  s: Pick<ShiftWindowLike, "startTime" | "endTime" | "crossesMidnight">,
  now: Date,
  tz: string = DEFAULT_TZ,
): ShiftPhase {
  const { start, end } = shiftStartEnd(prodDate, s, tz);
  if (now < start) return "upcoming";
  if (now < end) return "running";
  return "ended";
}

function byStart<T extends ShiftWindowLike>(shifts: readonly T[]): T[] {
  return [...shifts].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
}

/**
 * Gợi ý (ngày sản xuất, ca) theo giờ hiện tại:
 *  - đang giữa ca → ca đó;
 *  - giờ nghỉ giữa 2 ca (12–13, 17–18) → ca VỪA XONG (thợ nhập cuối ca);
 *  - sau ca cuối (sau 22h) → ca cuối CÙNG NGÀY;
 *  - trước ca đầu (trước 8h) → ca cuối của HÔM TRƯỚC;
 *  - ca qua nửa đêm bắt đầu hôm qua mà chưa kết thúc → ca đó, ngày hôm qua.
 */
export function suggestCurrentShift<T extends ShiftWindowLike>(
  now: Date,
  shifts: readonly T[],
  tz: string = DEFAULT_TZ,
): { prodDate: string; shift: T } | null {
  if (shifts.length === 0) return null;
  const { date: today, minutes: t } = localParts(now, tz);
  const sorted = byStart(shifts);

  for (const s of sorted) {
    if (s.crossesMidnight && t < timeToMinutes(s.endTime)) return { prodDate: addDays(today, -1), shift: s };
  }
  for (const s of sorted) {
    const st = timeToMinutes(s.startTime);
    const et = s.crossesMidnight ? 1440 : timeToMinutes(s.endTime);
    if (t >= st && t < et) return { prodDate: today, shift: s };
  }
  const ended = sorted.filter((s) => !s.crossesMidnight && timeToMinutes(s.endTime) <= t);
  if (ended.length > 0) {
    const last = ended.reduce((a, b) => (timeToMinutes(b.endTime) >= timeToMinutes(a.endTime) ? b : a));
    return { prodDate: today, shift: last };
  }
  return { prodDate: addDays(today, -1), shift: sorted[sorted.length - 1]! };
}
