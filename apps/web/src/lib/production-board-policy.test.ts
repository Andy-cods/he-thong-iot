import { describe, expect, it } from "vitest";
import { canSeeOrderValue } from "./production-board-policy";

/**
 * V4.4.2 — Việc 2: hàm quyền DUY NHẤT quyết định ai thấy/nhập đơn giá bán +
 * "Giá trị" mã hàng Bảng sản xuất. Dùng cả server (lọc field JSON) lẫn client
 * (ẩn/hiện ô nhập) — test ở đây đảm bảo đúng ĐÚNG 3 vai: admin/accountant/purchaser.
 */
describe("canSeeOrderValue", () => {
  it("admin/accountant/purchaser thấy giá", () => {
    expect(canSeeOrderValue(["admin"])).toBe(true);
    expect(canSeeOrderValue(["accountant"])).toBe(true);
    expect(canSeeOrderValue(["purchaser"])).toBe(true);
  });

  it("qc/planner/operator/warehouse/shareholder/display KHÔNG thấy giá", () => {
    expect(canSeeOrderValue(["qc"])).toBe(false);
    expect(canSeeOrderValue(["planner"])).toBe(false);
    expect(canSeeOrderValue(["operator"])).toBe(false);
    expect(canSeeOrderValue(["warehouse"])).toBe(false);
    expect(canSeeOrderValue(["shareholder"])).toBe(false);
    expect(canSeeOrderValue(["display"])).toBe(false);
  });

  it("nhiều vai, chỉ cần 1 vai được phép (OR)", () => {
    expect(canSeeOrderValue(["qc", "purchaser"])).toBe(true);
    expect(canSeeOrderValue(["qc", "warehouse"])).toBe(false);
  });

  it("rỗng/null/undefined → false", () => {
    expect(canSeeOrderValue([])).toBe(false);
    expect(canSeeOrderValue(null)).toBe(false);
    expect(canSeeOrderValue(undefined)).toBe(false);
  });
});
