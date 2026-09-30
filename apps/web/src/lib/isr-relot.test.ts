import { describe, expect, it } from "vitest";
import { sumPicksByItem, validateIsrOverridePicks, type IsrPickLine } from "./isr-relot";

const original: IsrPickLine[] = [
  {
    itemId: "item-1",
    sku: "VT-01",
    picks: [{ lotSerialId: "lot-a", binId: "bin-a", qty: 20 }],
  },
];

describe("sumPicksByItem", () => {
  it("cộng dồn nhiều dòng cùng item", () => {
    const m = sumPicksByItem([
      { itemId: "i1", picks: [{ lotSerialId: "l1", binId: "b1", qty: 5 }] },
      { itemId: "i1", picks: [{ lotSerialId: "l2", binId: "b1", qty: 3 }] },
    ]);
    expect(m.get("i1")).toBe(8);
  });
});

describe("validateIsrOverridePicks — chọn lại lô", () => {
  it("chọn lô mới cùng SL → hợp lệ, không phải partial", () => {
    const res = validateIsrOverridePicks(original, [
      { itemId: "item-1", sku: "VT-01", picks: [{ lotSerialId: "lot-b", binId: "bin-b", qty: 20 }] },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isPartial).toBe(false);
      expect(res.totalOverride).toBe(20);
    }
  });

  it("xuất một phần (ít hơn gốc) → isPartial=true", () => {
    const res = validateIsrOverridePicks(original, [
      { itemId: "item-1", sku: "VT-01", picks: [{ lotSerialId: "lot-b", binId: "bin-b", qty: 12 }] },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isPartial).toBe(true);
      expect(res.totalOverride).toBe(12);
    }
  });

  it("chặn xuất vượt SL đã xin ban đầu", () => {
    const res = validateIsrOverridePicks(original, [
      { itemId: "item-1", sku: "VT-01", picks: [{ lotSerialId: "lot-b", binId: "bin-b", qty: 25 }] },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("OVER_ORIGINAL_QTY");
  });

  it("chặn thêm mã hàng mới không thuộc yêu cầu gốc", () => {
    const res = validateIsrOverridePicks(original, [
      { itemId: "item-999", sku: "LẠ", picks: [{ lotSerialId: "lot-x", binId: "bin-x", qty: 1 }] },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UNKNOWN_ITEM");
  });

  it("chặn qty <= 0", () => {
    const res = validateIsrOverridePicks(original, [
      { itemId: "item-1", sku: "VT-01", picks: [{ lotSerialId: "lot-b", binId: "bin-b", qty: 0 }] },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_QTY");
  });

  it("chặn override rỗng", () => {
    const res = validateIsrOverridePicks(original, []);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("EMPTY");
  });

  it("cho phép override nhiều lô cho cùng 1 item cộng lại = gốc", () => {
    const res = validateIsrOverridePicks(original, [
      {
        itemId: "item-1",
        sku: "VT-01",
        picks: [
          { lotSerialId: "lot-b", binId: "bin-b", qty: 10 },
          { lotSerialId: "lot-c", binId: "bin-c", qty: 10 },
        ],
      },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.isPartial).toBe(false);
  });
});
