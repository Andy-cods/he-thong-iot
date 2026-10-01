import { describe, expect, it } from "vitest";
import {
  supplierCreateSchema,
  supplierListQuerySchema,
  supplierMergeSchema,
} from "./supplier";

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

describe("TASK-6VIEC Việc 3 — supplierMergeSchema", () => {
  const uuid = "00000000-0000-4000-8000-000000000001";

  it("yêu cầu targetId là UUID hợp lệ", () => {
    expect(() => supplierMergeSchema.parse({})).toThrow();
    expect(() => supplierMergeSchema.parse({ targetId: "not-a-uuid" })).toThrow();
    expect(supplierMergeSchema.parse({ targetId: uuid }).targetId).toBe(uuid);
  });

  it("strict — từ chối field lạ", () => {
    expect(() =>
      supplierMergeSchema.parse({ targetId: uuid, force: true }),
    ).toThrow();
  });
});
