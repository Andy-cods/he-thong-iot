import { buildPareto, computeKpis, type KpiResult, type KpiRow, type ParetoRow } from "./kpi";

/**
 * V4.10 (TASK-20261118-001) — gộp báo cáo Sản lượng ca từ dòng thô (thuần).
 * Dùng chung API báo cáo + Excel "Tổng hợp".
 */

export const REPORT_GROUPS = ["day-shift", "machine", "part", "operator", "shift"] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

export interface ReportEntryLike extends KpiRow {
  id: string;
  shiftCode: string;
  shiftName: string;
  shiftStart: string;
  machineCode: string;
  machineName: string;
  partId: string;
  partCode: string;
  partName: string;
  operatorId: string | null;
  operatorName: string | null;
}

export interface SummaryRow {
  key: string;
  label: string;
  sub: string | null;
  /** Số ca (ngày × ca) có chạy — để tính SL TB/ca. */
  shiftsRun: number;
  avgOkPerShift: number | null;
  kpi: KpiResult;
}

const NO_OPERATOR = "Chưa ghi người";

function keyLabel(r: ReportEntryLike, g: ReportGroup): { key: string; label: string; sub: string | null; sort: string } {
  switch (g) {
    case "day-shift":
      return { key: `${r.prodDate}|${r.shiftId}`, label: r.prodDate, sub: r.shiftName, sort: `${r.prodDate}|${r.shiftStart}` };
    case "machine":
      return { key: r.machineId, label: r.machineCode, sub: r.machineName, sort: r.machineCode };
    case "part":
      return { key: r.partId, label: r.partCode, sub: r.partName, sort: r.partCode };
    case "operator": {
      const name = r.operatorName?.trim() || NO_OPERATOR;
      return { key: r.operatorId ?? `name:${name.toLowerCase()}`, label: name, sub: null, sort: name };
    }
    case "shift":
      return { key: r.shiftId, label: r.shiftName, sub: r.shiftCode, sort: r.shiftStart };
  }
}

export function summarize(rows: readonly ReportEntryLike[], g: ReportGroup): SummaryRow[] {
  const buckets = new Map<string, { label: string; sub: string | null; sort: string; rows: ReportEntryLike[] }>();
  for (const r of rows) {
    const k = keyLabel(r, g);
    const b = buckets.get(k.key);
    if (b) b.rows.push(r);
    else buckets.set(k.key, { label: k.label, sub: k.sub, sort: k.sort, rows: [r] });
  }
  return [...buckets.entries()]
    .sort((a, b) => a[1].sort.localeCompare(b[1].sort, "vi"))
    .map(([key, b]) => {
      const kpi = computeKpis(b.rows);
      const shiftsRun = new Set(b.rows.map((r) => `${r.prodDate}|${r.shiftId}`)).size;
      return {
        key,
        label: b.label,
        sub: b.sub,
        shiftsRun,
        avgOkPerShift: shiftsRun > 0 ? kpi.ok / shiftsRun : null,
        kpi,
      };
    });
}

export interface TrendPoint {
  date: string;
  ok: number;
  ng: number;
  ngPct: number | null;
  availabilityPct: number | null;
}

/** Xu hướng theo ngày — đủ mọi ngày trong khoảng (ngày không có dữ liệu = 0 / null). */
export function trendByDay(rows: readonly ReportEntryLike[], from: string, to: string): TrendPoint[] {
  const byDay = new Map<string, ReportEntryLike[]>();
  for (const r of rows) {
    const l = byDay.get(r.prodDate);
    if (l) l.push(r);
    else byDay.set(r.prodDate, [r]);
  }
  const out: TrendPoint[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const k = computeKpis(byDay.get(d) ?? []);
    out.push({ date: d, ok: k.ok, ng: k.ng, ngPct: k.ngPct, availabilityPct: k.availabilityPct });
  }
  return out;
}

export function paretoFor(
  type: "defect" | "downtime",
  entries: readonly ReportEntryLike[],
  details: ReadonlyArray<{ entryId: string; reasonId: string; reasonName: string; value: number }>,
): { rows: ParetoRow[]; total: number } {
  const ids = new Set(entries.map((e) => e.id));
  const items = details
    .filter((d) => ids.has(d.entryId))
    .map((d) => ({ key: d.reasonId, label: d.reasonName, value: d.value }));
  const total =
    type === "defect"
      ? entries.reduce((a, e) => a + e.qtyNg, 0)
      : entries.reduce((a, e) => a + (e.downtimeMin ?? 0), 0);
  return { rows: buildPareto(items, total), total };
}
