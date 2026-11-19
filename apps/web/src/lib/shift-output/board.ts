import { computeKpis, type KpiResult, type KpiRow } from "./kpi";
import { shiftPhase, type ShiftWindowLike } from "./shift-window";

/**
 * V4.10 (TASK-20261118-001) — lưới "Hôm nay" Máy × Ca (hàm thuần).
 * Ô: đã nhập (xanh/xám trung tính) · "Chưa nhập" (đỏ — ca đã kết thúc mà
 * không có dòng) · "Đang chạy" · "Chưa tới ca" (xám) · khoá.
 */
export type BoardCellState = "done" | "missing" | "running" | "upcoming";

export interface BoardEntryLike extends KpiRow {
  id: string;
  partCode: string;
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
      });
    }
  }
  return { date: input.date, cells, kpi: computeKpis(input.entries), missingCount };
}
