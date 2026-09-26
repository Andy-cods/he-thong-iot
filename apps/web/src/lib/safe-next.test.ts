import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "./safe-next";

describe("V4.1 AD-20 — sanitizeNextPath", () => {
  it("giữ đường dẫn nội bộ kèm query/hash", () => {
    expect(sanitizeNextPath("/work-orders/abc?tab=history#x")).toBe(
      "/work-orders/abc?tab=history#x",
    );
    expect(sanitizeNextPath("/")).toBe("/");
  });

  it("rỗng / null → fallback", () => {
    expect(sanitizeNextPath(null)).toBe("/");
    expect(sanitizeNextPath("")).toBe("/");
    expect(sanitizeNextPath(undefined, "/board")).toBe("/board");
  });

  it("chặn URL tuyệt đối và protocol-relative", () => {
    expect(sanitizeNextPath("https://evil.com")).toBe("/");
    expect(sanitizeNextPath("//evil.com")).toBe("/");
    expect(sanitizeNextPath("/\\evil.com")).toBe("/");
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/");
    expect(sanitizeNextPath("evil.com/x")).toBe("/");
  });

  it("chặn ký tự điều khiển và backslash", () => {
    expect(sanitizeNextPath("/\t/evil.com")).toBe("/");
    expect(sanitizeNextPath("/\n/evil.com")).toBe("/");
    expect(sanitizeNextPath("/a\\b")).toBe("/");
    expect(sanitizeNextPath("/%2F%2Fevil.com")).toBe("/%2F%2Fevil.com"); // vẫn là path nội bộ
  });

  it("không quay lại chính trang đăng nhập", () => {
    expect(sanitizeNextPath("/login?next=/x")).toBe("/");
  });
});
