import { describe, expect, it } from "vitest";
import { isInvalidStocktakeCountInput, parseStocktakeCountInput } from "./stocktake-count-input";

describe("parseStocktakeCountInput", () => {
  it("rỗng → hợp lệ, value null (chưa đếm)", () => {
    expect(parseStocktakeCountInput("")).toEqual({ ok: true, value: null });
    expect(parseStocktakeCountInput("   ")).toEqual({ ok: true, value: null });
  });

  it("số nguyên/thập phân dấu chấm → hợp lệ", () => {
    expect(parseStocktakeCountInput("12")).toEqual({ ok: true, value: 12 });
    expect(parseStocktakeCountInput("12.5")).toEqual({ ok: true, value: 12.5 });
    expect(parseStocktakeCountInput("0")).toEqual({ ok: true, value: 0 });
  });

  it("dấu phẩy thập phân kiểu Việt ('12,5') → tự đổi thành 12.5 (KHÔNG âm thầm thành null)", () => {
    expect(parseStocktakeCountInput("12,5")).toEqual({ ok: true, value: 12.5 });
    expect(parseStocktakeCountInput(" 7,25 ")).toEqual({ ok: true, value: 7.25 });
  });

  it("số âm → KHÔNG hợp lệ (ok:false) — không đếm âm", () => {
    expect(parseStocktakeCountInput("-5")).toEqual({ ok: false });
  });

  it("chuỗi không parse được thành số → ok:false (lỗi gốc: trước đây Number()=NaN rồi JSON.stringify biến thành null, server âm thầm coi là 'chưa đếm')", () => {
    expect(parseStocktakeCountInput("abc")).toEqual({ ok: false });
    expect(parseStocktakeCountInput("12,5,3")).toEqual({ ok: false });
    expect(parseStocktakeCountInput("--1")).toEqual({ ok: false });
    expect(parseStocktakeCountInput("Infinity")).toEqual({ ok: false });
  });
});

describe("isInvalidStocktakeCountInput", () => {
  it("rỗng → không coi là lỗi (chỉ là chưa đếm)", () => {
    expect(isInvalidStocktakeCountInput("")).toBe(false);
  });
  it("số hợp lệ (kể cả dấu phẩy) → không lỗi", () => {
    expect(isInvalidStocktakeCountInput("12,5")).toBe(false);
    expect(isInvalidStocktakeCountInput("3")).toBe(false);
  });
  it("chuỗi có nội dung nhưng không parse được → lỗi", () => {
    expect(isInvalidStocktakeCountInput("abc")).toBe(true);
    expect(isInvalidStocktakeCountInput("-1")).toBe(true);
  });
});
