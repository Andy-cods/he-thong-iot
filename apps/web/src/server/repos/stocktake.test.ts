import { describe, expect, it, vi } from "vitest";

// stocktake.ts import `db` (dùng thật ở các hàm chạm DB) — test này chỉ chạm
// phần THUẦN (computeLineDiff/summarizeStocktakeVariance/isSessionFullyCounted),
// mock db theo mẫu putawaySuggestion.test.ts để import module không đòi DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  computeLineDiff,
  isSessionFullyCounted,
  summarizeStocktakeVariance,
  type StocktakeLineLike,
  type StocktakeVarianceLine,
} from "./stocktake";

describe("computeLineDiff", () => {
  it("chưa đếm (countedQty null) → 0", () => {
    expect(computeLineDiff({ lineId: "a", bookQty: 10, countedQty: null })).toBe(0);
  });
  it("đếm thừa → dương", () => {
    expect(computeLineDiff({ lineId: "a", bookQty: 10, countedQty: 12 })).toBe(2);
  });
  it("đếm thiếu → âm", () => {
    expect(computeLineDiff({ lineId: "a", bookQty: 10, countedQty: 7 })).toBe(-3);
  });
  it("đếm khớp → 0", () => {
    expect(computeLineDiff({ lineId: "a", bookQty: 5, countedQty: 5 })).toBe(0);
  });
  it("làm tròn 4 số lẻ (tránh sai số float)", () => {
    expect(computeLineDiff({ lineId: "a", bookQty: 0.1, countedQty: 0.3 })).toBeCloseTo(0.2, 4);
  });
});

describe("isSessionFullyCounted", () => {
  it("mảng rỗng → false (chưa chụp dòng nào, không cho gửi duyệt)", () => {
    expect(isSessionFullyCounted([])).toBe(false);
  });
  it("còn 1 dòng null → false", () => {
    const lines: StocktakeLineLike[] = [
      { lineId: "a", bookQty: 1, countedQty: 1 },
      { lineId: "b", bookQty: 2, countedQty: null },
    ];
    expect(isSessionFullyCounted(lines)).toBe(false);
  });
  it("mọi dòng đã đếm (kể cả 0) → true", () => {
    const lines: StocktakeLineLike[] = [
      { lineId: "a", bookQty: 1, countedQty: 0 },
      { lineId: "b", bookQty: 2, countedQty: 2 },
    ];
    expect(isSessionFullyCounted(lines)).toBe(true);
  });
});

describe("summarizeStocktakeVariance", () => {
  it("không có dòng nào lệch → diffLines=0, value=null (không có giá)", () => {
    const lines: StocktakeVarianceLine[] = [
      { lineId: "a", bookQty: 5, countedQty: 5, diffQty: 0 },
    ];
    const s = summarizeStocktakeVariance(lines);
    expect(s.diffLines).toBe(0);
    expect(s.surplusQty).toBe(0);
    expect(s.shortageQty).toBe(0);
    expect(s.surplusValue).toBeNull();
    expect(s.shortageValue).toBeNull();
  });

  it("tính đúng thừa/thiếu + giá trị khi có đơn giá", () => {
    const lines: StocktakeVarianceLine[] = [
      { lineId: "a", bookQty: 10, countedQty: 12, diffQty: 0, unitPrice: 1000 }, // +2 * 1000
      { lineId: "b", bookQty: 10, countedQty: 7, diffQty: 0, unitPrice: 2000 }, // -3 * 2000
      { lineId: "c", bookQty: 5, countedQty: 5, diffQty: 0 }, // khớp
      { lineId: "d", bookQty: 5, countedQty: null, diffQty: 0 }, // chưa đếm
    ];
    const s = summarizeStocktakeVariance(lines);
    expect(s.totalLines).toBe(4);
    expect(s.countedLines).toBe(3);
    expect(s.uncountedLines).toBe(1);
    expect(s.diffLines).toBe(2);
    expect(s.surplusQty).toBe(2);
    expect(s.shortageQty).toBe(3);
    expect(s.surplusValue).toBe(2000);
    expect(s.shortageValue).toBe(6000);
  });

  it("có dòng lệch nhưng KHÔNG có đơn giá nào → value null (không giả định giá trị)", () => {
    const lines: StocktakeVarianceLine[] = [
      { lineId: "a", bookQty: 10, countedQty: 12, diffQty: 0 },
    ];
    const s = summarizeStocktakeVariance(lines);
    expect(s.diffLines).toBe(1);
    expect(s.surplusValue).toBeNull();
  });
});
