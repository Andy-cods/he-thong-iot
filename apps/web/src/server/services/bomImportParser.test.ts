import { describe, expect, it } from "vitest";
import { autoMapHeaders, BOM_SYNONYM_DICT } from "./bomImportParser";

/**
 * V3 — unit tests cho phần thuần JS của bomImportParser:
 *   - autoMapHeaders claim target (1 target = 1 header trừ multi-value notes).
 *   - Synonym match cho header file "Bản chính thức".
 *
 * Không test parseBomImport (cần workbook ExcelJS) — flow đó đã được verify
 * end-to-end qua wizard production V1.
 */

describe("autoMapHeaders", () => {
  it("map header chính thức từ file Bản chính thức Z0000002", () => {
    const headers = [
      "Image",
      "ID Number",
      "Quantity",
      "Standard Number",
      "Sub Category",
      "Visible Part Size",
      "NCC/Vật tư",
      "Note 1",
      "Note 2",
      "Note 3",
    ];
    const m = autoMapHeaders(headers);
    expect(m["ID Number"]).toBe("componentSeq");
    expect(m["Quantity"]).toBe("qtyPerParent");
    expect(m["Standard Number"]).toBe("componentSku");
    expect(m["Sub Category"]).toBe("description");
    expect(m["Visible Part Size"]).toBe("size");
    expect(m["NCC/Vật tư"]).toBe("supplierItemCode");
    // 3 cột Note đều map vào notes (multi-value target).
    expect(m["Note 1"]).toBe("notes");
    expect(m["Note 2"]).toBe("notes");
    expect(m["Note 3"]).toBe("notes");
  });

  it("claim target — 1 target chỉ map cho 1 header (Quantity vs Số lượng)", () => {
    // Test case: file Bản chính thức có cả "Quantity" (col 3 = qty/máy)
    // và "Số lượng" (col 12 = total). Cả 2 đều normalize match qtyPerParent
    // — claim phải bảo "Quantity" thắng (header đầu tiên), "Số lượng" → null.
    const headers = ["Quantity", "Số lượng"];
    const m = autoMapHeaders(headers);
    expect(m["Quantity"]).toBe("qtyPerParent");
    expect(m["Số lượng"]).toBeNull();
  });

  it("notes là multi-value target — không claim", () => {
    const headers = ["Note 1", "Note 2", "Note 3", "Ghi chú"];
    const m = autoMapHeaders(headers);
    expect(m["Note 1"]).toBe("notes");
    expect(m["Note 2"]).toBe("notes");
    expect(m["Note 3"]).toBe("notes");
    expect(m["Ghi chú"]).toBe("notes");
  });

  it("header rỗng/null → null", () => {
    const headers = ["", "   ", "Image"];
    const m = autoMapHeaders(headers);
    expect(m[""]).toBeNull();
    expect(m["   "]).toBeNull();
    expect(m["Image"]).toBeNull();
  });

  it("fuzzy match Levenshtein dist ≤ 2", () => {
    // "Standar Numb" (typo) → componentSku qua synonym "standardnumber" (dist=3)
    // Không nên match vì > 2. Nhưng "Standardnum" (12 chars vs 14) → dist=3,
    // cũng không match.
    const m = autoMapHeaders(["Quantty"]); // typo of Quantity, dist=1
    expect(m["Quantty"]).toBe("qtyPerParent");
  });

  it("synonym dict có đủ 7 target", () => {
    expect(Object.keys(BOM_SYNONYM_DICT).sort()).toEqual([
      "componentSeq",
      "componentSku",
      "description",
      "notes",
      "qtyPerParent",
      "size",
      "supplierItemCode",
    ]);
  });
});
