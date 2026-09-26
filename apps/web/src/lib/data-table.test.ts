import { describe, expect, it } from "vitest";
import {
  alignForKind,
  cellClassForKind,
  defaultMobileRole,
  isInteractiveTarget,
  splitMobileColumns,
  sumColumn,
} from "./data-table";

describe("data-table helpers (V4.1 UI-11..14)", () => {
  it("canh phải số / tiền / hành động, còn lại canh trái", () => {
    expect(alignForKind("money")).toBe("right");
    expect(alignForKind("number")).toBe("right");
    expect(alignForKind("actions")).toBe("right");
    expect(alignForKind("text")).toBe("left");
    expect(alignForKind(undefined)).toBe("left");
  });

  it("số dùng tabular-nums + canh phải", () => {
    expect(cellClassForKind("money")).toContain("tabular-nums");
    expect(cellClassForKind("money")).toContain("text-right");
    expect(cellClassForKind("code")).toContain("font-mono");
    expect(cellClassForKind("text")).toBe("");
  });

  it("vai trò điện thoại mặc định theo loại cột", () => {
    expect(defaultMobileRole("status")).toBe("status");
    expect(defaultMobileRole("actions")).toBe("actions");
    expect(defaultMobileRole("money")).toBe("secondary");
  });

  it("chia cột thẻ điện thoại, bỏ cột hide", () => {
    const l = splitMobileColumns([
      { id: "code", mobile: "primary" },
      { id: "name" },
      { id: "st", kind: "status" },
      { id: "x", mobile: "hide" },
      { id: "act", kind: "actions" },
    ]);
    expect(l.primary.map((c) => c.id)).toEqual(["code"]);
    expect(l.secondary.map((c) => c.id)).toEqual(["name"]);
    expect(l.status.map((c) => c.id)).toEqual(["st"]);
    expect(l.actions.map((c) => c.id)).toEqual(["act"]);
  });

  it("không có primary → cột secondary đầu tiên thành tiêu đề thẻ", () => {
    const l = splitMobileColumns([{ id: "a" }, { id: "b" }, { id: "s", kind: "status" }]);
    expect(l.primary.map((c) => c.id)).toEqual(["a"]);
    expect(l.secondary.map((c) => c.id)).toEqual(["b"]);
  });

  it("cộng cột: nhận chuỗi numeric, bỏ null/NaN", () => {
    expect(sumColumn([{ v: 1 }, { v: "2.5" }, { v: null }, { v: "abc" }], (r) => r.v)).toBe(3.5);
    expect(sumColumn([], () => 1)).toBe(0);
  });

  it("click vào phần tử tương tác không mở hàng", () => {
    expect(isInteractiveTarget(null)).toBe(false);
    expect(isInteractiveTarget({ closest: () => null })).toBe(false);
    expect(isInteractiveTarget({ closest: () => ({}) })).toBe(true);
  });
});
