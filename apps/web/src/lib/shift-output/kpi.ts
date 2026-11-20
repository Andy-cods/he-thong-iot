/**
 * V4.10 (TASK-20261118-001) — KPI sản lượng ca (OEE-lite, hàm thuần).
 *
 * - Sản xuất = OK + NG; %NG = NG / sản xuất.
 * - % đạt KH = Σ OK / Σ KH, CHỈ trên các dòng có nhập kế hoạch.
 * - % khả dụng (Q5) = (Σ phút ca − Σ phút dừng) / Σ phút ca, trong đó phút ca
 *   tính MỘT LẦN cho mỗi (ngày, ca, máy) dù ca đó chạy 2–3 mã hàng; phút dừng
 *   của 1 máy-ca không vượt phút ca.
 * - P2 (giờ chạy thực tế): phút của 1 (ngày, ca, máy) = max(phút dòng cũ không
 *   có giờ thực tế, ĐỘ DÀI HỢP các khoảng giờ thực tế) → 2 mã chạy nối tiếp
 *   07–12 + 12–19 = 720'; 2 mã cùng khung giờ chỉ tính 1 lần.
 * - Mọi chỉ số trả `null` khi thiếu dữ liệu (không hiện "0%" gây hoang mang):
 *   chưa sản xuất → %NG null; không dòng nào có KH → % đạt KH null; không dòng
 *   nào ghi dừng máy → % khả dụng null.
 */

import { timeToMinutes } from "./shift-window";

export interface KpiRow {
  prodDate: string;
  shiftId: string;
  machineId: string;
  qtyOk: number;
  qtyNg: number;
  qtyPlanned: number | null;
  downtimeMin: number | null;
  /** Phút khả dụng của dòng (thực tế nếu có workStart/workEnd, ngược lại độ dài ca). */
  shiftMinutes: number;
  /** P2 — giờ chạy thực tế (null = dòng P1). */
  workStart?: string | null;
  workEnd?: string | null;
  /** Giờ bắt đầu ca — neo khoảng giờ thực tế qua nửa đêm. */
  shiftStart?: string | null;
}

/**
 * Khoảng [bắt đầu, kết thúc) theo phút, neo quanh giờ bắt đầu ca (lệch gần
 * nhất trong ±12h) để ca đêm 19–07 với dòng 00:30–07:00 nằm SAU 19:00.
 */
export function workInterval(r: KpiRow): [number, number] | null {
  if (!r.workStart || !r.workEnd || r.shiftMinutes <= 0) return null;
  let start = timeToMinutes(r.workStart);
  if (r.shiftStart) {
    const anchor = timeToMinutes(r.shiftStart);
    let d = start - anchor;
    while (d < -720) d += 1440;
    while (d >= 720) d -= 1440;
    start = anchor + d;
  }
  return [start, start + r.shiftMinutes];
}

/** Độ dài hợp các khoảng (phút). */
export function unionMinutes(intervals: ReadonlyArray<[number, number]>): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [s, e] of sorted) {
    if (!cur || s > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [s, e];
    } else if (e > cur[1]) {
      cur[1] = e;
    }
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

export interface KpiResult {
  entries: number;
  ok: number;
  ng: number;
  produced: number;
  ngPct: number | null;
  planned: number | null;
  planPct: number | null;
  downtimeMin: number | null;
  availableMin: number;
  availabilityPct: number | null;
  /** Số (ngày, ca, máy) có dữ liệu. */
  machineShifts: number;
}

export function computeKpis(rows: readonly KpiRow[]): KpiResult {
  let ok = 0;
  let ng = 0;
  let planned = 0;
  let okOnPlanned = 0;
  let hasPlan = false;
  let hasDowntime = false;
  const slots = new Map<string, { legacy: number; intervals: Array<[number, number]>; downtime: number }>();

  for (const r of rows) {
    ok += r.qtyOk;
    ng += r.qtyNg;
    if (r.qtyPlanned != null) {
      hasPlan = true;
      planned += r.qtyPlanned;
      okOnPlanned += r.qtyOk;
    }
    if (r.downtimeMin != null) hasDowntime = true;
    const key = `${r.prodDate}|${r.shiftId}|${r.machineId}`;
    const slot = slots.get(key) ?? { legacy: 0, intervals: [], downtime: 0 };
    const iv = workInterval(r);
    if (iv) slot.intervals.push(iv);
    else slot.legacy = Math.max(slot.legacy, r.shiftMinutes);
    slot.downtime += r.downtimeMin ?? 0;
    slots.set(key, slot);
  }

  let availableMin = 0;
  let downtime = 0;
  for (const s of slots.values()) {
    const minutes = Math.max(s.legacy, unionMinutes(s.intervals));
    availableMin += minutes;
    downtime += Math.min(s.downtime, minutes);
  }
  const produced = ok + ng;
  return {
    entries: rows.length,
    ok,
    ng,
    produced,
    ngPct: produced > 0 ? (ng / produced) * 100 : null,
    planned: hasPlan ? planned : null,
    planPct: hasPlan && planned > 0 ? (okOnPlanned / planned) * 100 : null,
    downtimeMin: hasDowntime ? downtime : null,
    availableMin,
    availabilityPct: hasDowntime && availableMin > 0 ? ((availableMin - downtime) / availableMin) * 100 : null,
    machineShifts: slots.size,
  };
}

export function groupKpis<T extends KpiRow>(
  rows: readonly T[],
  keyOf: (r: T) => string,
): Map<string, KpiResult> {
  const buckets = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const list = buckets.get(k);
    if (list) list.push(r);
    else buckets.set(k, [r]);
  }
  const out = new Map<string, KpiResult>();
  for (const [k, list] of buckets) out.set(k, computeKpis(list));
  return out;
}

export interface ParetoInput {
  key: string;
  label: string;
  value: number;
}

export interface ParetoRow extends ParetoInput {
  pct: number;
  cumPct: number;
}

export const UNCLASSIFIED_KEY = "__unclassified__";
export const UNCLASSIFIED_LABEL = "Chưa phân loại";

/**
 * Pareto giảm dần + % tích luỹ. `total` = tổng thật (Σ NG hoặc Σ phút dừng của
 * các dòng); phần chưa gán lý do (total − Σ chi tiết) hiện là "Chưa phân loại".
 */
export function buildPareto(items: readonly ParetoInput[], total?: number): ParetoRow[] {
  const merged = new Map<string, ParetoInput>();
  for (const it of items) {
    if (it.value <= 0) continue;
    const cur = merged.get(it.key);
    if (cur) cur.value += it.value;
    else merged.set(it.key, { ...it });
  }
  const list = [...merged.values()];
  const classified = list.reduce((a, b) => a + b.value, 0);
  if (total != null && total > classified) {
    list.push({ key: UNCLASSIFIED_KEY, label: UNCLASSIFIED_LABEL, value: total - classified });
  }
  list.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "vi"));
  const grand = list.reduce((a, b) => a + b.value, 0);
  let cum = 0;
  return list.map((it) => {
    cum += it.value;
    return { ...it, pct: grand > 0 ? (it.value / grand) * 100 : 0, cumPct: grand > 0 ? (cum / grand) * 100 : 0 };
  });
}
