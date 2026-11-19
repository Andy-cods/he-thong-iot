/**
 * V4.10 (TASK-20261118-001) — KPI sản lượng ca (OEE-lite, hàm thuần).
 *
 * - Sản xuất = OK + NG; %NG = NG / sản xuất.
 * - % đạt KH = Σ OK / Σ KH, CHỈ trên các dòng có nhập kế hoạch.
 * - % khả dụng (Q5) = (Σ phút ca − Σ phút dừng) / Σ phút ca, trong đó phút ca
 *   tính MỘT LẦN cho mỗi (ngày, ca, máy) dù ca đó chạy 2–3 mã hàng; phút dừng
 *   của 1 máy-ca không vượt phút ca.
 * - Mọi chỉ số trả `null` khi thiếu dữ liệu (không hiện "0%" gây hoang mang):
 *   chưa sản xuất → %NG null; không dòng nào có KH → % đạt KH null; không dòng
 *   nào ghi dừng máy → % khả dụng null.
 */

export interface KpiRow {
  prodDate: string;
  shiftId: string;
  machineId: string;
  qtyOk: number;
  qtyNg: number;
  qtyPlanned: number | null;
  downtimeMin: number | null;
  shiftMinutes: number;
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
  const slots = new Map<string, { minutes: number; downtime: number }>();

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
    const slot = slots.get(key) ?? { minutes: 0, downtime: 0 };
    slot.minutes = Math.max(slot.minutes, r.shiftMinutes);
    slot.downtime += r.downtimeMin ?? 0;
    slots.set(key, slot);
  }

  let availableMin = 0;
  let downtime = 0;
  for (const s of slots.values()) {
    availableMin += s.minutes;
    downtime += Math.min(s.downtime, s.minutes);
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
