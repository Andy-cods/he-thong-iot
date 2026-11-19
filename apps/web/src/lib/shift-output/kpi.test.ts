import { describe, expect, it } from "vitest";
import { buildPareto, computeKpis, groupKpis, UNCLASSIFIED_LABEL, type KpiRow } from "./kpi";
import { buildBoard } from "./board";

const row = (p: Partial<KpiRow> = {}): KpiRow => ({
  prodDate: "2026-11-18",
  shiftId: "ca1",
  machineId: "m1",
  qtyOk: 100,
  qtyNg: 0,
  qtyPlanned: null,
  downtimeMin: null,
  shiftMinutes: 240,
  ...p,
});

describe("computeKpis", () => {
  it("rỗng → mọi tỉ lệ null", () => {
    const k = computeKpis([]);
    expect(k).toMatchObject({ ok: 0, ng: 0, ngPct: null, planPct: null, availabilityPct: null, downtimeMin: null });
  });
  it("khả dụng: 2 mã cùng 1 máy-ca → phút ca tính 1 lần (240, không 480)", () => {
    const k = computeKpis([row({ downtimeMin: 30 }), row({ downtimeMin: 20, qtyOk: 50 })]);
    expect(k.availableMin).toBe(240);
    expect(k.downtimeMin).toBe(50);
    expect(k.availabilityPct).toBeCloseTo((190 / 240) * 100, 6);
    expect(k.machineShifts).toBe(1);
  });
  it("khả dụng: 2 máy × 1 ca → 480 phút; dừng của 1 máy-ca không vượt phút ca", () => {
    const k = computeKpis([row({ downtimeMin: 200 }), row({ downtimeMin: 100 }), row({ machineId: "m2", downtimeMin: 0 })]);
    expect(k.availableMin).toBe(480);
    expect(k.downtimeMin).toBe(240);
    expect(k.availabilityPct).toBeCloseTo(50, 6);
  });
  it("không ai ghi dừng máy → khả dụng null (không hiện 100% giả)", () => {
    expect(computeKpis([row(), row({ machineId: "m2" })]).availabilityPct).toBeNull();
  });
  it("%NG và % đạt KH chỉ trên dòng có KH", () => {
    const k = computeKpis([row({ qtyOk: 90, qtyNg: 10, qtyPlanned: 100 }), row({ shiftId: "ca2", qtyOk: 50 })]);
    expect(k.ngPct).toBeCloseTo((10 / 150) * 100, 6);
    expect(k.planned).toBe(100);
    expect(k.planPct).toBeCloseTo(90, 6);
  });
  it("groupKpis theo máy", () => {
    const g = groupKpis([row(), row({ machineId: "m2", qtyOk: 7 })], (r) => r.machineId);
    expect(g.get("m2")?.ok).toBe(7);
  });
});

describe("buildPareto", () => {
  it("giảm dần + % tích luỹ + 'Chưa phân loại' = tổng − Σ chi tiết", () => {
    const p = buildPareto(
      [
        { key: "a", label: "Ba-via", value: 3 },
        { key: "b", label: "Kích thước sai", value: 7 },
        { key: "a", label: "Ba-via", value: 2 },
      ],
      20,
    );
    expect(p.map((x) => [x.label, x.value])).toEqual([
      [UNCLASSIFIED_LABEL, 8],
      ["Kích thước sai", 7],
      ["Ba-via", 5],
    ]);
    expect(p.at(-1)?.cumPct).toBeCloseTo(100, 6);
    expect(p[0]?.pct).toBeCloseTo(40, 6);
  });
  it("không có tổng hoặc đủ phân loại → không thêm dòng chưa phân loại", () => {
    expect(buildPareto([{ key: "a", label: "A", value: 5 }], 5).map((x) => x.key)).toEqual(["a"]);
    expect(buildPareto([], 0)).toEqual([]);
  });
});

describe("buildBoard — lưới Hôm nay", () => {
  const shifts = [
    { id: "ca1", startTime: "08:00", endTime: "12:00" },
    { id: "ca2", startTime: "13:00", endTime: "17:00" },
    { id: "ca3", startTime: "18:00", endTime: "22:00" },
  ];
  it("đã nhập / chưa nhập (đỏ) / đang chạy / chưa tới ca", () => {
    const b = buildBoard({
      date: "2026-11-18",
      now: new Date("2026-11-18T14:00:00+07:00"),
      machines: [{ id: "m1" }, { id: "m2" }],
      shifts,
      entries: [{ ...row(), id: "e1", partCode: "TRUC", locked: false }],
    });
    const st = (m: string, s: string) => b.cells.find((c) => c.machineId === m && c.shiftId === s)?.state;
    expect(st("m1", "ca1")).toBe("done");
    expect(st("m2", "ca1")).toBe("missing");
    expect(st("m1", "ca2")).toBe("running");
    expect(st("m1", "ca3")).toBe("upcoming");
    expect(b.missingCount).toBe(1);
    expect(b.kpi.ok).toBe(100);
  });
});
