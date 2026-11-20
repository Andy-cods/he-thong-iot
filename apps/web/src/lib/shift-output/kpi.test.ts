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

describe("P2 — KPI theo giờ chạy thực tế", () => {
  const actual = (ws: string, we: string, minutes: number, p: Partial<KpiRow> = {}) =>
    row({ workStart: ws, workEnd: we, shiftMinutes: minutes, shiftStart: "07:00", ...p });

  it("1 dòng chạy 07–19 → 720' khả dụng (không phải 240' của ca)", () => {
    const k = computeKpis([actual("07:00", "19:00", 720, { downtimeMin: 72 })]);
    expect(k.availableMin).toBe(720);
    expect(k.availabilityPct).toBeCloseTo(90, 6);
  });
  it("2 mã nối tiếp cùng máy-ca 07–12 + 12–19 → hợp 720'", () => {
    const k = computeKpis([actual("07:00", "12:00", 300), actual("12:00", "19:00", 420, { qtyOk: 5 })]);
    expect(k.availableMin).toBe(720);
  });
  it("2 mã cùng khung giờ (mặc định giờ ca) → tính 1 lần", () => {
    const k = computeKpis([actual("07:00", "19:00", 720), actual("07:00", "19:00", 720, { qtyOk: 1 })]);
    expect(k.availableMin).toBe(720);
  });
  it("ca đêm 19–07: 19:00–00:30 + 00:30–07:00 neo đúng sau nửa đêm → 720'", () => {
    const night = { shiftStart: "19:00", shiftId: "dem" };
    const k = computeKpis([actual("19:00", "00:30", 330, night), actual("00:30", "07:00", 390, { ...night, qtyOk: 2 })]);
    expect(k.availableMin).toBe(720);
    expect(k.machineShifts).toBe(1);
  });
  it("giờ thực tế bắt đầu SỚM hơn ca (06:30 cho ca 07:00) vẫn neo đúng", () => {
    const k = computeKpis([actual("06:30", "07:30", 60), actual("07:00", "08:00", 60, { qtyOk: 1 })]);
    expect(k.availableMin).toBe(90);
  });
  it("trộn dòng cũ (không giờ thực tế) + dòng mới cùng máy-ca → lấy lớn hơn", () => {
    const k = computeKpis([row({ shiftMinutes: 240 }), actual("07:00", "19:00", 720, { qtyOk: 1 })]);
    expect(k.availableMin).toBe(720);
    const k2 = computeKpis([row({ shiftMinutes: 240 }), actual("08:00", "09:00", 60, { qtyOk: 1 })]);
    expect(k2.availableMin).toBe(240);
  });
  it("dòng demo cũ giữ nguyên hành vi P1", () => {
    const k = computeKpis([row({ downtimeMin: 30 }), row({ machineId: "m2" })]);
    expect(k.availableMin).toBe(480);
  });
  it("board: ô hiện giờ thực tế khi khác giờ ca + ảnh mã hàng", () => {
    const b = buildBoard({
      date: "2026-11-18",
      now: new Date("2026-11-19T10:00:00+07:00"),
      machines: [{ id: "m1" }],
      shifts: [{ id: "ca1", startTime: "08:00", endTime: "12:00" }],
      entries: [
        { ...row({ workStart: "07:00:00", workEnd: "19:00:00", shiftMinutes: 720 }), id: "e1", partId: "p1", partCode: "TRUC", partImageAssetId: "a1", locked: false },
        { ...row({ workStart: "08:00", workEnd: "12:00" }), id: "e2", partId: "p2", partCode: "BAC", partImageAssetId: null, locked: false },
      ],
    });
    const c = b.cells[0]!;
    expect(c.workRanges).toEqual(["07:00–19:00"]);
    expect(c.images).toEqual([{ partId: "p1", partCode: "TRUC", assetId: "a1" }]);
    expect(b.kpi.availableMin).toBe(720);
  });
});
