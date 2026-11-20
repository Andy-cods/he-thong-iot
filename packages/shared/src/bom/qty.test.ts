import { describe, expect, it } from "vitest";
import {
  bomLineTotalQty,
  buildTrienKhaiQtyCheck,
  inferSetCount,
  resolveQtyPerSet,
  setCountNoticeText,
  trienKhaiQtyWarningText,
} from "./qty";

describe("inferSetCount", () => {
  it("ghi chú 'Số bộ = N' thắng", () => {
    expect(inferSetCount(4, [{ coef: 6, qty: 30 }])).toEqual({ setCount: 4, source: "NOTE", basisRows: 0 });
  });
  it("thiếu ghi chú, mọi dòng cùng tỉ lệ nguyên → suy ra", () => {
    const r = inferSetCount(null, [
      { coef: 6, qty: 24 },
      { coef: 1, qty: 4 },
      { coef: null, qty: 8 }, // bỏ qua (thiếu Hệ số)
      { coef: 2, qty: null }, // bỏ qua (thiếu SL)
    ]);
    expect(r).toEqual({ setCount: 4, source: "INFERRED", basisRows: 2 });
    expect(setCountNoticeText(r)).toMatch(/suy ra Số bộ = 4 .*2 dòng/);
  });
  it("tỉ lệ lệch nhau / không nguyên / không có dữ liệu → 1 + cảnh báo", () => {
    expect(inferSetCount(null, [{ coef: 6, qty: 24 }, { coef: 1, qty: 5 }]).source).toBe("DEFAULT");
    expect(inferSetCount(null, [{ coef: 2, qty: 3 }]).setCount).toBe(1);
    const none = inferSetCount(0, []);
    expect(none).toEqual({ setCount: 1, source: "DEFAULT", basisRows: 0 });
    expect(setCountNoticeText(none)).toMatch(/tạm dùng Số bộ = 1/);
    expect(setCountNoticeText({ setCount: 4, source: "NOTE", basisRows: 0 })).toBeNull();
  });
  it("sai số thực (0.1 × 3) vẫn nhận ra tỉ lệ nguyên", () => {
    expect(inferSetCount(null, [{ coef: 0.1, qty: 0.30000000000000004 }, { coef: 2, qty: 6 }]).setCount).toBe(3);
  });
});

describe("resolveQtyPerSet", () => {
  it("Hệ số > 0 → Hệ số (KHÔNG dùng SL đã nhân số bộ)", () => {
    expect(resolveQtyPerSet({ coef: 6, qty: 24 }, 4)).toEqual({ qtyPerSet: 6, source: "COEF" });
  });
  it("thiếu Hệ số → SL ÷ Số bộ; 1 bộ → SL; thiếu cả hai → 1", () => {
    expect(resolveQtyPerSet({ coef: null, qty: 24 }, 4)).toEqual({ qtyPerSet: 6, source: "SL_DIV_SETS" });
    expect(resolveQtyPerSet({ coef: 0, qty: 10 }, 3).qtyPerSet).toBeCloseTo(3.333333, 6);
    expect(resolveQtyPerSet({ coef: null, qty: 5 }, 1)).toEqual({ qtyPerSet: 5, source: "SL" });
    expect(resolveQtyPerSet({ coef: null, qty: 5 }, null)).toEqual({ qtyPerSet: 5, source: "SL" });
    expect(resolveQtyPerSet({ coef: null, qty: null }, 4)).toEqual({ qtyPerSet: 1, source: "DEFAULT" });
  });
});

describe("buildTrienKhaiQtyCheck", () => {
  const rows = [
    { rowNumber: 7, position: "CP3", coef: 6, qty: 24 },
    { rowNumber: 8, position: "CP4", coef: 6, qty: 20 },
    { rowNumber: 9, position: "CP5", coef: null, qty: 8 },
    { rowNumber: 10, position: "CP6", coef: null, qty: null },
    { rowNumber: 11, position: "CP7", coef: 2, qty: null },
  ];
  const c = buildTrienKhaiQtyCheck(rows, 4);
  it("SL hệ thống = SL/bộ × Số bộ cho từng dòng", () => {
    expect(c.rows.map((r) => [r.position, r.qtyPerSet, r.systemQty, r.mismatch])).toEqual([
      ["CP3", 6, 24, false],
      ["CP4", 6, 24, true],
      ["CP5", 2, 8, false],
      ["CP6", 1, 4, true],
      ["CP7", 2, 8, false],
    ]);
  });
  it("cảnh báo nói rõ giá trị nào được dùng", () => {
    expect(c.mismatches.map((r) => trienKhaiQtyWarningText(r, 4))).toEqual([
      "Dòng 8 (CP4): SL file 20 ≠ Hệ số 6 × Số bộ 4 = 24 — hệ thống dùng Hệ số 6/bộ (tổng 24).",
      "Dòng 10 (CP6): thiếu cả Hệ số và SL — hệ thống tạm dùng 1/bộ (tổng 4).",
    ]);
  });
  it("Số bộ ≤ 0 coi như 1", () => {
    expect(buildTrienKhaiQtyCheck(rows.slice(0, 1), 0).setCount).toBe(1);
  });
});

describe("bomLineTotalQty (cột SL lưới = SL cần sổ bước = SL mặc định PR/YCSX/PO)", () => {
  it("SL/bộ × số bộ", () => {
    expect(bomLineTotalQty({ fileQty: 24 }, "6.000000", "4.0000")).toBe(24);
    expect(bomLineTotalQty(null, 6, 4)).toBe(24);
  });
  it("fileQty KHÔNG được dùng hiển thị (đổi số bộ → SL đổi theo)", () => {
    expect(bomLineTotalQty({ fileQty: 24 }, 6, 5)).toBe(30);
  });
  it("BOM mẫu cũ: metadata.totalQty > 0 thắng; rỗng/0/rác → công thức", () => {
    expect(bomLineTotalQty({ totalQty: "14" }, 1, 1)).toBe(14);
    expect(bomLineTotalQty({ totalQty: 0 }, 2, 3)).toBe(6);
    expect(bomLineTotalQty({ totalQty: "" }, 2, 3)).toBe(6);
    expect(bomLineTotalQty({ totalQty: "abc" }, 2, 3)).toBe(6);
  });
  it("thiếu số → 0, làm tròn 4 chữ số", () => {
    expect(bomLineTotalQty(null, null, 4)).toBe(0);
    expect(bomLineTotalQty(null, "0.33333333", 3)).toBe(1);
  });
});
