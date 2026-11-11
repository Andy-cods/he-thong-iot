import { describe, expect, it } from "vitest";
import { buildStageBuckets, canMove } from "./bom-stage-ledger";

describe("buildStageBuckets", () => {
  it("dòng mới: toàn bộ ở bước 0", () => {
    expect(buildStageBuckets("GTAM", 10, [])).toEqual({
      BLANK: 10, MACHINING: 0, SURFACE: 0, QC: 0, ASSEMBLY: 0,
    });
  });
  it("cộng trừ theo move, tổng bảo toàn", () => {
    const b = buildStageBuckets("COMMERCIAL", 10, [
      { from: "PROPOSE", to: "PO", qty: 10 },
      { from: "PO", to: "STOCK", qty: 4 },
      { from: "STOCK", to: "QC", qty: 1.5 },
    ]);
    expect(b).toEqual({ PROPOSE: 0, PO: 6, STOCK: 2.5, QC: 1.5, ASSEMBLY: 0 });
    expect(Object.values(b).reduce((a, c) => a + c, 0)).toBe(10);
  });
  it("làm tròn 4 số lẻ, bỏ qua bước lạ", () => {
    const b = buildStageBuckets("GTAM", 1, [
      { from: "BLANK", to: "MACHINING", qty: 0.1 },
      { from: "BLANK", to: "MACHINING", qty: 0.2 },
      { from: "XXX", to: "QC", qty: 5 },
    ]);
    expect(b.BLANK).toBe(0.7);
    expect(b.MACHINING).toBe(0.3);
    expect(b.QC).toBe(0);
  });
});

describe("canMove", () => {
  const b = buildStageBuckets("GTAM", 10, [{ from: "BLANK", to: "MACHINING", qty: 6 }]);
  it("hợp lệ: tiến, đủ, đúng bằng bucket", () => {
    expect(canMove("GTAM", b, "BLANK", "MACHINING", 4)).toEqual({ ok: true });
    expect(canMove("GTAM", b, "MACHINING", "QC", 6)).toEqual({ ok: true }); // nhảy bước
  });
  it("vượt bucket", () => {
    expect(canMove("GTAM", b, "BLANK", "MACHINING", 4.001)).toEqual({ ok: false, reason: "EXCEEDS_BUCKET" });
    expect(canMove("GTAM", b, "SURFACE", "QC", 1)).toEqual({ ok: false, reason: "EXCEEDS_BUCKET" });
  });
  it("sai SL", () => {
    for (const q of [0, -1, NaN, Infinity]) {
      expect(canMove("GTAM", b, "BLANK", "MACHINING", q)).toEqual({ ok: false, reason: "BAD_QTY" });
    }
  });
  it("sai bước / cùng bước", () => {
    expect(canMove("GTAM", b, "BLANK", "PO", 1)).toEqual({ ok: false, reason: "BAD_STAGE" });
    expect(canMove("GTAM", b, "BLANK", "BLANK", 1)).toEqual({ ok: false, reason: "SAME_STAGE" });
  });
  it("lùi chỉ khi bút toán đảo", () => {
    expect(canMove("GTAM", b, "MACHINING", "BLANK", 2)).toEqual({ ok: false, reason: "BACKWARD" });
    expect(canMove("GTAM", b, "MACHINING", "BLANK", 2, { isReversal: true })).toEqual({ ok: true });
    expect(canMove("GTAM", b, "MACHINING", "BLANK", 7, { isReversal: true })).toEqual({ ok: false, reason: "EXCEEDS_BUCKET" });
  });
  it("không vượt tổng cần sau đảo", () => {
    const after = buildStageBuckets("GTAM", 10, [
      { from: "BLANK", to: "MACHINING", qty: 6 },
      { from: "MACHINING", to: "BLANK", qty: 6 },
    ]);
    expect(after.BLANK).toBe(10);
    expect(canMove("GTAM", after, "MACHINING", "QC", 1)).toEqual({ ok: false, reason: "EXCEEDS_BUCKET" });
  });
});
