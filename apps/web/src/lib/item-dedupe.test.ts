import { describe, expect, it } from "vitest";
import { findExactNameDuplicate, normalizeItemName } from "./item-dedupe";

describe("normalizeItemName", () => {
  it("bỏ dấu tiếng Việt + hạ chữ thường", () => {
    expect(normalizeItemName("Nhôm")).toBe("nhom");
    expect(normalizeItemName("Đồng")).toBe("dong");
  });

  it("gộp khoảng trắng thừa + trim", () => {
    expect(normalizeItemName("  Nhôm   6061  ")).toBe("nhom 6061");
  });
});

describe("findExactNameDuplicate", () => {
  const candidates = [
    { id: "1", sku: "AL01", name: "AL6061 mạ màu silver" },
    { id: "2", sku: "VT-01", name: "[DEMO] Nhôm" },
  ];

  it("bắt trùng dù khác hoa/thường + dấu (khớp bug thật LOOP_E2E #2: '[DEMO] Nhôm' tạo lặp)", () => {
    const dup = findExactNameDuplicate("[demo] nhom", candidates);
    expect(dup?.id).toBe("2");
  });

  it("không trùng nếu tên thực sự khác", () => {
    expect(findExactNameDuplicate("Nhựa PB108", candidates)).toBeNull();
  });

  it("tên rỗng → không trùng (tránh match rác)", () => {
    expect(findExactNameDuplicate("   ", candidates)).toBeNull();
  });

  it("bắt trùng khi chỉ khác khoảng trắng thừa", () => {
    const dup = findExactNameDuplicate("AL6061  mạ màu   silver", candidates);
    expect(dup?.id).toBe("1");
  });
});
