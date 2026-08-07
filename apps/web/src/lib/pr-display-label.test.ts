import { describe, expect, it } from "vitest";
import { deriveDisplayLabel } from "./pr-display-label";

/**
 * V3.16 — Unit test cho deriveDisplayLabel (nhãn hiển thị tự-sinh cho
 * PR/MR list, tên sheet Excel, tên file khi phiếu chưa có title thủ công).
 */

describe("deriveDisplayLabel", () => {
  it("trả về fallback khi mảng rỗng", () => {
    expect(deriveDisplayLabel([])).toBe("Chưa có vật tư");
  });

  it("trả về fallback khi dòng đầu không có name", () => {
    expect(deriveDisplayLabel([{ name: null }])).toBe("Chưa có vật tư");
    expect(deriveDisplayLabel([{ name: "   " }])).toBe("Chưa có vật tư");
  });

  it("dùng name dòng đầu tiên, không prefix sku khi sku rỗng/null/undefined", () => {
    expect(deriveDisplayLabel([{ name: "Bulong M8" }])).toBe("Bulong M8");
    expect(deriveDisplayLabel([{ name: "Bulong M8", sku: "" }])).toBe(
      "Bulong M8",
    );
    expect(deriveDisplayLabel([{ name: "Bulong M8", sku: null }])).toBe(
      "Bulong M8",
    );
  });

  it("prefix [sku] khi dòng đầu có sku không rỗng", () => {
    expect(
      deriveDisplayLabel([{ name: "Bulong M8", sku: "BL-M8" }]),
    ).toBe("[BL-M8] Bulong M8");
  });

  it("thêm hậu tố +N khi nhiều hơn 1 dòng, chỉ lấy dòng đầu làm gốc", () => {
    expect(
      deriveDisplayLabel([
        { name: "Bulong M8", sku: "BL-M8" },
        { name: "Ecu M8" },
        { name: "Vong dem" },
      ]),
    ).toBe("[BL-M8] Bulong M8 +2");
  });

  it("không sort lại — luôn ưu tiên đúng dòng đầu tiên đã truyền vào", () => {
    expect(
      deriveDisplayLabel([{ name: "Z vật tư" }, { name: "A vật tư" }]),
    ).toBe("Z vật tư +1");
  });

  it("cắt phần tên theo maxLen kèm …, giữ nguyên hậu tố +N ghép sau", () => {
    const longName = "A".repeat(80);
    const result = deriveDisplayLabel(
      [{ name: longName }, { name: "khác" }],
      60,
    );
    expect(result).toBe(`${"A".repeat(60)}… +1`);
  });

  it("không cắt khi độ dài vừa đúng hoặc ngắn hơn maxLen", () => {
    const name = "B".repeat(60);
    expect(deriveDisplayLabel([{ name }], 60)).toBe(name);
    expect(deriveDisplayLabel([{ name: "Ngắn" }], 60)).toBe("Ngắn");
  });
});
