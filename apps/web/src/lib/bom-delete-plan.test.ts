import { describe, expect, it } from "vitest";
import { bulkDeleteDescription, countBulkDelete } from "./bom-delete-plan";

describe("B7 countBulkDelete / bulkDeleteDescription", () => {
  const rows = [{ status: "DRAFT" }, { status: "ACTIVE" }, { status: "ACTIVE" }, { status: "OBSOLETE" }];
  it("planner: ACTIVE và OBSOLETE bị cấm, đếm riêng", () => {
    expect(countBulkDelete(rows, false)).toEqual({ soft: 1, hard: 0, forbiddenActive: 2, forbiddenObsolete: 1 });
  });
  it("admin: ACTIVE xoá mềm, OBSOLETE xoá cứng", () => {
    expect(countBulkDelete(rows, true)).toEqual({ soft: 3, hard: 1, forbiddenActive: 0, forbiddenObsolete: 0 });
  });
  it("câu cấm nói đúng trạng thái: chỉ ACTIVE bị cấm → không nhắc 'ngừng dùng'", () => {
    const d = bulkDeleteDescription(countBulkDelete([{ status: "ACTIVE" }], false), "Ngừng dùng");
    expect(d).toContain("1 BOM đang dùng sẽ được bỏ qua");
    expect(d).not.toContain("đã ngừng dùng sẽ được bỏ qua");
  });
  it("chỉ OBSOLETE bị cấm → câu 'đã ngừng dùng'", () => {
    const d = bulkDeleteDescription(countBulkDelete([{ status: "OBSOLETE" }], false), "Ngừng dùng");
    expect(d).toContain("1 BOM đã ngừng dùng sẽ được bỏ qua");
  });
  it("số đếm = số dòng được chọn (trang hiện tại), không hơn", () => {
    const c = countBulkDelete(rows, true);
    expect(c.soft + c.hard + c.forbiddenActive + c.forbiddenObsolete).toBe(rows.length);
  });
});
