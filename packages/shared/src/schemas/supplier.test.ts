import { describe, expect, it } from "vitest";
import { supplierCreateSchema, supplierListQuerySchema } from "./supplier";

describe("supplier schemas", () => {
  it("coi thiếu isActive là không lọc (Tất cả)", () => {
    expect(supplierListQuerySchema.parse({}).isActive).toBeUndefined();
  });

  it("parse đúng filter NCC đang dùng/ngưng dùng", () => {
    expect(
      supplierListQuerySchema.parse({ isActive: "true" }).isActive,
    ).toBe(true);
    expect(
      supplierListQuerySchema.parse({ isActive: "false" }).isActive,
    ).toBe(false);
  });

  it("chuẩn hóa mã NCC thành chữ hoa khi tạo", () => {
    expect(
      supplierCreateSchema.parse({ code: "ncc-001", name: "Nhà cung cấp" })
        .code,
    ).toBe("NCC-001");
  });
});
