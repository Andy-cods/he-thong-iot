import { describe, expect, it } from "vitest";
import { z } from "zod";
import { viErrorMap } from "./zod-vi";

// V4.1 UI-28 (Đợt 6B) — thông báo zod mặc định tiếng Việt.

const msg = (schema: z.ZodTypeAny, value: unknown) => {
  const r = schema.safeParse(value, { errorMap: viErrorMap });
  return r.success ? null : r.error.issues[0]?.message;
};

describe("viErrorMap", () => {
  it("chuỗi rỗng / thiếu / quá dài", () => {
    expect(msg(z.string().min(1), "")).toBe("Bắt buộc nhập.");
    expect(msg(z.string().min(3), "a")).toBe("Tối thiểu 3 ký tự.");
    expect(msg(z.string().max(2), "abc")).toBe("Tối đa 2 ký tự.");
    expect(msg(z.string(), undefined)).toBe("Bắt buộc nhập.");
  });
  it("số, email, enum", () => {
    expect(msg(z.number().positive(), 0)).toBe("Phải > 0.");
    expect(msg(z.number(), "x")).toBe("Phải là số.");
    expect(msg(z.string().email(), "x")).toBe("Email không hợp lệ.");
    expect(msg(z.enum(["A", "B"]), "C")).toBe("Lựa chọn không hợp lệ.");
  });
  it("message riêng của schema vẫn ưu tiên", () => {
    expect(msg(z.string().min(1, "Nhập tên"), "")).toBe("Nhập tên");
  });
  it("không còn chuỗi tiếng Anh mặc định", () => {
    expect(msg(z.string().min(2), "")).not.toMatch(/String must/);
  });
});
