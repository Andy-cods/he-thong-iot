import { describe, expect, it } from "vitest";
import { boardActivationSchema, isValidYmd, ymdSchema } from "./bomRevision";

describe("B9 isValidYmd", () => {
  it("ngày thật", () => {
    expect(isValidYmd("2026-11-20")).toBe(true);
    expect(isValidYmd("2028-02-29")).toBe(true);
    expect(isValidYmd("2026-12-31")).toBe(true);
  });
  it("ngày không tồn tại / sai định dạng", () => {
    expect(isValidYmd("2026-02-31")).toBe(false);
    expect(isValidYmd("2027-02-29")).toBe(false);
    expect(isValidYmd("2026-13-01")).toBe(false);
    expect(isValidYmd("2026-00-10")).toBe(false);
    expect(isValidYmd("2026-04-31")).toBe(false);
    expect(isValidYmd("2026-1-1")).toBe(false);
    expect(isValidYmd("abc")).toBe(false);
    expect(isValidYmd("")).toBe(false);
  });
});

describe("ymdSchema / boardActivationSchema", () => {
  it("báo lỗi tiếng Việt", () => {
    const r = ymdSchema().safeParse("2026-02-31");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toContain("Ngày không hợp lệ");
  });
  it("deadline null/undefined vẫn được; 2026-02-31 bị từ chối; 2028-02-29 đúng", () => {
    expect(boardActivationSchema.safeParse({}).success).toBe(true);
    expect(boardActivationSchema.safeParse({ deadline: null }).success).toBe(true);
    expect(boardActivationSchema.safeParse({ deadline: "2028-02-29" }).success).toBe(true);
    const bad = boardActivationSchema.safeParse({ deadline: "2026-02-31" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]!.message).toBe("Ngày cần giao không hợp lệ");
  });
});
