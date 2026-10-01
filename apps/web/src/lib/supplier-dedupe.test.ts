import { describe, expect, it } from "vitest";
import { findSimilarSupplier, normalizeSupplierName, type SupplierNameCandidate } from "./supplier-dedupe";

/**
 * V4.5 QA-A P1 — tái hiện đúng ca lỗi thật: "Mạnh Hưng" (gõ tắt) phải được
 * nhận diện là trùng với NCC đã có "CÔNG TY TNHH SẢN XUẤT THƯƠNG MẠI DỊCH VỤ
 * MẠNH HƯNG" (tên pháp lý đầy đủ).
 */
describe("normalizeSupplierName", () => {
  it("bỏ dấu + hạ chữ thường + gộp khoảng trắng", () => {
    expect(normalizeSupplierName("  Mạnh   Hưng ")).toBe("manh hung");
  });

  it("bỏ từ chỉ loại hình DN (Công ty/TNHH/Cổ phần/CP)", () => {
    expect(normalizeSupplierName("Công ty TNHH Mạnh Hưng")).toBe("manh hung");
    expect(
      normalizeSupplierName("CÔNG TY TNHH SẢN XUẤT THƯƠNG MẠI DỊCH VỤ MẠNH HƯNG"),
    ).toBe("san xuat thuong mai dich vu manh hung");
    expect(normalizeSupplierName("Công ty Cổ phần ABC")).toBe("abc");
    expect(normalizeSupplierName("Công ty CP ABC")).toBe("abc");
  });
});

describe("findSimilarSupplier — tái hiện ca lỗi thật QA-A", () => {
  const candidates: SupplierNameCandidate[] = [
    {
      id: "s1",
      code: "NCC-001",
      name: "CÔNG TY TNHH SẢN XUẤT THƯƠNG MẠI DỊCH VỤ MẠNH HƯNG",
      taxCode: "0312345678",
      phone: "0901234567",
    },
    { id: "s2", code: "NCC-002", name: "Công ty TNHH ABC Việt Nam", taxCode: null, phone: null },
  ];

  it("gõ tên rút gọn 'Mạnh Hưng' → nhận diện trùng NCC-001 (tên con ⊂ tên pháp lý đầy đủ)", () => {
    const dup = findSimilarSupplier("Mạnh Hưng", candidates);
    expect(dup?.id).toBe("s1");
  });

  it("gõ tên không liên quan → không trùng", () => {
    expect(findSimilarSupplier("Thành Đạt", candidates)).toBeNull();
  });

  it("gõ ĐÚNG tên pháp lý đầy đủ → vẫn nhận diện trùng", () => {
    const dup = findSimilarSupplier(
      "CÔNG TY TNHH SẢN XUẤT THƯƠNG MẠI DỊCH VỤ MẠNH HƯNG",
      candidates,
    );
    expect(dup?.id).toBe("s1");
  });

  it("tên quá ngắn sau chuẩn hoá (< 3 ký tự) → không coi là trùng (tránh dương tính giả)", () => {
    expect(findSimilarSupplier("Cp", candidates)).toBeNull();
    expect(findSimilarSupplier("", candidates)).toBeNull();
  });

  it("danh sách ứng viên rỗng → null", () => {
    expect(findSimilarSupplier("Mạnh Hưng", [])).toBeNull();
  });

  it("khác loại hình DN nhưng cùng tên gốc vẫn trùng (Cổ phần vs TNHH)", () => {
    const list: SupplierNameCandidate[] = [
      { id: "x1", code: "X1", name: "Công ty Cổ phần Thành Đạt", taxCode: null, phone: null },
    ];
    expect(findSimilarSupplier("Công ty TNHH Thành Đạt", list)?.id).toBe("x1");
  });
});
