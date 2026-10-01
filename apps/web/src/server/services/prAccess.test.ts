import { describe, expect, it } from "vitest";
import { canExportPrExcel, canViewAllPRs } from "./prAccess";

describe("TASK-6VIEC Việc 1 — canExportPrExcel", () => {
  it("cho phép admin/purchaser/accountant xuất Excel", () => {
    expect(canExportPrExcel(["admin"])).toBe(true);
    expect(canExportPrExcel(["purchaser"])).toBe(true);
    expect(canExportPrExcel(["accountant"])).toBe(true);
  });

  it("chặn các vai khác (planner/warehouse/operator/qc)", () => {
    expect(canExportPrExcel(["planner"])).toBe(false);
    expect(canExportPrExcel(["warehouse"])).toBe(false);
    expect(canExportPrExcel(["operator"])).toBe(false);
    expect(canExportPrExcel(["qc"])).toBe(false);
    expect(canExportPrExcel([])).toBe(false);
  });

  it("multi-role (OR) — chỉ cần 1 role đủ quyền trong danh sách role của user", () => {
    expect(canExportPrExcel(["operator", "accountant"])).toBe(true);
    expect(canExportPrExcel(["operator", "qc"])).toBe(false);
  });
});

describe("canViewAllPRs — không bị ảnh hưởng bởi thay đổi quyền xuất Excel", () => {
  it("vẫn giữ nguyên danh sách role xem tất cả phiếu", () => {
    expect(canViewAllPRs(["warehouse"])).toBe(true);
    expect(canViewAllPRs(["operator"])).toBe(false);
  });
});
