import { computeKpis, type KpiResult, type KpiRow } from "./kpi";
import { shiftPhase, workRangeLabel, type ShiftWindowLike } from "./shift-window";

/**
 * V4.10 (TASK-20261118-001) — lưới "Hôm nay" Máy × Ca (hàm thuần).
 * Ô: đã nhập (xanh/xám trung tính) · "Chưa nhập" (đỏ — ca đã kết thúc mà
 * không có dòng) · "Đang chạy" · "Chưa tới ca" (xám) · khoá.
 */
export type BoardCellState = "done" | "missing" | "running" | "upcoming";

export interface BoardEntryLike extends KpiRow {
  id: string;
  partId?: string;
  partCode: string;
  /** P2 — ảnh mã hàng (bom_asset id) để hiện thumbnail trong ô. */
  partImageAssetId?: string | null;
  locked: boolean;
}

export interface BoardCell {
  machineId: string;
  shiftId: string;
  state: BoardCellState;
  ok: number;
  ng: number;
  entries: number;
  locked: boolean;
  partCodes: string[];
  /** P2 — giờ chạy thực tế KHÁC giờ ca ("07:00–19:00"), không trùng lặp. */
  workRanges: string[];
  /** P2 — mã hàng có ảnh (tối đa 2) cho thumbnail. */
  images: Array<{ partId: string; partCode: string; assetId: string }>;
}

export interface BoardResult {
  date: string;
  cells: BoardCell[];
  kpi: KpiResult;
  missingCount: number;
}

export function buildBoard(input: {
  date: string;
  now: Date;
  tz?: string;
  machines: ReadonlyArray<{ id: string }>;
  shifts: ReadonlyArray<ShiftWindowLike>;
  entries: ReadonlyArray<BoardEntryLike>;
}): BoardResult {
  const cells: BoardCell[] = [];
  let missingCount = 0;
  for (const m of input.machines) {
    for (const s of input.shifts) {
      const list = input.entries.filter((e) => e.machineId === m.id && e.shiftId === s.id);
      const phase = shiftPhase(input.date, s, input.now, input.tz);
      let state: BoardCellState;
      if (list.length > 0) state = "done";
      else if (phase === "ended") state = "missing";
      else if (phase === "running") state = "running";
      else state = "upcoming";
      if (state === "missing") missingCount += 1;
      cells.push({
        machineId: m.id,
        shiftId: s.id,
        state,
        ok: list.reduce((a, e) => a + e.qtyOk, 0),
        ng: list.reduce((a, e) => a + e.qtyNg, 0),
        entries: list.length,
        locked: list.length > 0 && list.every((e) => e.locked),
        partCodes: [...new Set(list.map((e) => e.partCode))],
        workRanges: [
          ...new Set(
            list
              .map((e) => workRangeLabel(e.workStart, e.workEnd, s.startTime, s.endTime))
              .filter((x): x is string => !!x),
          ),
        ],
        images: list
          .filter((e) => e.partId && e.partImageAssetId)
          .filter((e, i, arr) => arr.findIndex((x) => x.partId === e.partId) === i)
          .slice(0, 2)
          .map((e) => ({ partId: e.partId!, partCode: e.partCode, assetId: e.partImageAssetId! })),
      });
    }
  }
  return { date: input.date, cells, kpi: computeKpis(input.entries), missingCount };
}
