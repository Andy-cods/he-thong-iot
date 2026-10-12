import { describe, expect, it } from "vitest";
import {
  formatVnNumberText,
  normalizeNumStr,
  parseVnNumberText,
  validatePrLines,
} from "./pr-form";

describe("pr-form số", () => {
  it("bỏ đuôi .000000 / .00", () => {
    expect(normalizeNumStr("2.500000")).toBe("2.5");
    expect(normalizeNumStr("1500000.00")).toBe("1500000");
    expect(normalizeNumStr("100")).toBe("100");
    expect(normalizeNumStr("0.000")).toBe("0");
  });
  it("format và parse VN", () => {
    expect(formatVnNumberText("1500000.5")).toBe("1.500.000,5");
    expect(parseVnNumberText("1.500.000,5", 2)).toBe("1500000.5");
    expect(parseVnNumberText("12,3456", 3)).toBe("12.345");
    expect(parseVnNumberText("007", 0)).toBe("7");
  });
});

const base = {
  localId: "a",
  item: null,
  specification: "",
  qty: "1",
  neededBy: "",
  notes: "",
  referenceCode: "",
};

describe("validatePrLines", () => {
  it("bỏ qua dòng trống nguyên trạng", () => {
    expect(validatePrLines([base], "2026-10-12")).toEqual([]);
  });
  it("dòng có SL khác mặc định nhưng chưa chọn vật tư", () => {
    const e = validatePrLines([base, { ...base, localId: "b", qty: "5" }], "2026-10-12");
    expect(e[0]).toMatchObject({ localId: "b", message: "Dòng 2 chưa chọn vật tư" });
  });
  it("SL <= 0 và ngày quá khứ", () => {
    const item = { id: "x" };
    expect(validatePrLines([{ ...base, item, qty: "0" }], "2026-10-12")[0]?.message).toMatch(
      /Dòng 1.*lớn hơn 0/,
    );
    expect(
      validatePrLines([{ ...base, item, neededBy: "2026-10-01" }], "2026-10-12")[0]?.message,
    ).toMatch(/quá khứ/);
  });
});
