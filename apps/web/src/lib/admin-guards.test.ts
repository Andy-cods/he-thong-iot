import { describe, expect, it } from "vitest";
import { isSelfAdminDemotion } from "./admin-guards";

describe("V4.1 AD-12 — isSelfAdminDemotion", () => {
  const base = { actorUserId: "a", targetUserId: "a", beforeRoles: ["admin"] };

  it("chặn admin tự bỏ vai trò admin", () => {
    expect(isSelfAdminDemotion({ ...base, nextRoles: ["planner"] })).toBe(true);
    expect(isSelfAdminDemotion({ ...base, nextRoles: [] })).toBe(true);
  });

  it("cho phép tự đổi vai trò khác mà vẫn giữ admin", () => {
    expect(isSelfAdminDemotion({ ...base, nextRoles: ["admin", "planner"] })).toBe(false);
  });

  it("không đổi vai trò (chỉ sửa tên/email) → không chặn", () => {
    expect(isSelfAdminDemotion({ ...base, nextRoles: undefined })).toBe(false);
  });

  it("admin hạ quyền admin của NGƯỜI KHÁC → không chặn", () => {
    expect(
      isSelfAdminDemotion({ ...base, targetUserId: "b", nextRoles: ["planner"] }),
    ).toBe(false);
  });
});
