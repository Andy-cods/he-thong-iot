import { describe, expect, it } from "vitest";
import { buildJourney, defaultMove, lineRequiredQty, stageErrorMessage } from "./bom-stage-journey";

describe("lineRequiredQty — khớp cột SL của lưới", () => {
  it("metadata.totalQty (>0) thắng", () => {
    expect(lineRequiredQty({ totalQty: "7" }, "2", "10")).toBe(7);
    expect(lineRequiredQty({ totalQty: 7 }, 2, 10)).toBe(7);
  });
  it("không có / ≤0 / không phải số → qty_per_parent × targetQty", () => {
    expect(lineRequiredQty({}, "2", "10")).toBe(20);
    expect(lineRequiredQty(null, "1.5", "4")).toBe(6);
    expect(lineRequiredQty({ totalQty: "0" }, "2", "10")).toBe(20);
    expect(lineRequiredQty({ totalQty: "abc" }, "2", "10")).toBe(20);
  });
});

describe("buildJourney", () => {
  it("reached = tổng từ bước đó trở đi; pct theo SL cần", () => {
    const j = buildJourney("GTAM", 10, { BLANK: 1, MACHINING: 4, SURFACE: 0, QC: 3, ASSEMBLY: 2 });
    expect(j.stages.map((s) => s.reached)).toEqual([10, 9, 5, 5, 2]);
    expect(j.stages.map((s) => s.pct)).toEqual([100, 90, 50, 50, 20]);
    expect(j.split).toBe(true);
    expect(j.full).toBe(false);
    expect(j.parts.map((p) => `${p.label} ${p.qty}`)).toEqual(["Lắp ráp 2", "QC 3", "Gia công 4", "Chờ phôi 1"]);
  });
  it("chưa chuyển gì: 1 bước, không 'từng phần'", () => {
    const j = buildJourney("GTAM", 5, { BLANK: 5, MACHINING: 0, SURFACE: 0, QC: 0, ASSEMBLY: 0 });
    expect(j.split).toBe(false);
    expect(j.full).toBe(false);
    expect(j.stages[0]!.pct).toBe(100);
    expect(j.stages[1]!.pct).toBe(0);
  });
  it("đã giao lắp ráp đủ", () => {
    const j = buildJourney("OUTSOURCED", 6, { ORDER: 0, VENDOR: 0, RECEIVED: 0, QC: 0, ASSEMBLY: 6 });
    expect(j.full).toBe(true);
    expect(j.split).toBe(false);
    expect(j.stages.every((s) => s.pct === 100)).toBe(true);
  });
  it("OTHER dùng nhãn thương mại; required=0 không chia cho 0", () => {
    const j = buildJourney("OTHER", 0, { PROPOSE: 0, PO: 0, STOCK: 0, QC: 0, ASSEMBLY: 0 });
    expect(j.stages[1]!.label).toBe("Đặt PO");
    expect(j.full).toBe(false);
    expect(j.stages.every((s) => s.pct === 0)).toBe(true);
  });
});

describe("defaultMove", () => {
  it("nguồn = bước xa nhất còn hàng chưa ở cuối; đích = kế tiếp; SL = toàn bộ bucket", () => {
    const d = defaultMove("GTAM", { BLANK: 3, MACHINING: 4, SURFACE: 0, QC: 0, ASSEMBLY: 2 });
    expect(d).toEqual({ ok: true, from: "MACHINING", to: "SURFACE", qty: 4 });
  });
  it("hàng ở QC → chuyển sang Lắp ráp", () => {
    expect(defaultMove("COMMERCIAL", { PROPOSE: 0, PO: 0, STOCK: 0, QC: 2.5, ASSEMBLY: 0 })).toEqual({
      ok: true,
      from: "QC",
      to: "ASSEMBLY",
      qty: 2.5,
    });
  });
  it("hết hàng chuyển được: có lý do", () => {
    const full = defaultMove("GTAM", { BLANK: 0, MACHINING: 0, SURFACE: 0, QC: 0, ASSEMBLY: 5 });
    expect(full.ok).toBe(false);
    const empty = defaultMove("GTAM", { BLANK: 0, MACHINING: 0, SURFACE: 0, QC: 0, ASSEMBLY: 0 });
    expect(empty.ok).toBe(false);
    if (!full.ok && !empty.ok) expect(full.reason).not.toBe(empty.reason);
  });
});

describe("stageErrorMessage", () => {
  it("có thông báo tiếng Việt cho từng mã, mặc định chung", () => {
    expect(stageErrorMessage("EXCEEDS_BUCKET")).toMatch(/vượt/);
    expect(stageErrorMessage("???")).toBe("Không chuyển được bước.");
  });
});
