import { describe, expect, it } from "vitest";
import { withQuery } from "./redirect-query";

describe("V4.1 AD-18 — withQuery giữ dữ liệu điền sẵn khi redirect", () => {
  it("không có query → giữ nguyên path", () => {
    expect(withQuery("/work-orders/new-lsx")).toBe("/work-orders/new-lsx");
    expect(withQuery("/work-orders/new-lsx", {})).toBe("/work-orders/new-lsx");
  });

  it("chuyển tiếp query, encode tiếng Việt, mảng lặp key", () => {
    const url = withQuery("/work-orders/new-lsx", {
      note: "Tạo từ BOM X · dòng A",
      orderCode: "SO-1",
      tag: ["a", "b"],
      empty: undefined,
    });
    const u = new URL(url, "http://x");
    expect(u.pathname).toBe("/work-orders/new-lsx");
    expect(u.searchParams.get("note")).toBe("Tạo từ BOM X · dòng A");
    expect(u.searchParams.get("orderCode")).toBe("SO-1");
    expect(u.searchParams.getAll("tag")).toEqual(["a", "b"]);
    expect(u.searchParams.has("empty")).toBe(false);
  });

  it("path đã có query → nối bằng &", () => {
    expect(withQuery("/sales?tab=po", { q: "1" })).toBe("/sales?tab=po&q=1");
  });
});
