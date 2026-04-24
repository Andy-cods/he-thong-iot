/**
 * V1.9 P10 — Test `canForUser` merge logic.
 *
 * Mock `findActiveOverride` để không cần DB. Test các tổ hợp:
 *  - Role allow + no override → role
 *  - Role allow + override DENY → override-deny (deny wins)
 *  - Role deny + override GRANT → override-grant (escalate)
 *  - Role deny + no override → role
 *  - Role allow + override expired → role (đã filter ở repo)
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const findActiveOverrideMock = vi.fn();
vi.mock("../repos/userPermissionOverrides", () => ({
  findActiveOverride: (...args: unknown[]) =>
    findActiveOverrideMock(...args),
}));

import { canForUser } from "./rbac";

afterEach(() => {
  findActiveOverrideMock.mockReset();
});

describe("canForUser — merge role + override", () => {
  it("role allow + no override → allowed (source=role)", async () => {
    findActiveOverrideMock.mockResolvedValue(null);
    const r = await canForUser("u1", ["planner"], "create", "item");
    expect(r).toEqual({ allowed: true, source: "role" });
  });

  it("role deny + no override → denied (source=role)", async () => {
    findActiveOverrideMock.mockResolvedValue(null);
    const r = await canForUser("u1", ["operator"], "create", "item");
    expect(r).toEqual({ allowed: false, source: "role" });
  });

  it("role allow + override DENY → denied (deny wins)", async () => {
    findActiveOverrideMock.mockResolvedValue({
      granted: false,
      entity: "item",
      action: "create",
    });
    const r = await canForUser("u1", ["planner"], "create", "item");
    expect(r).toEqual({ allowed: false, source: "override-deny" });
  });

  it("role deny + override GRANT → allowed (escalate)", async () => {
    findActiveOverrideMock.mockResolvedValue({
      granted: true,
      entity: "supplier",
      action: "create",
    });
    const r = await canForUser("u1", ["operator"], "create", "supplier");
    expect(r).toEqual({ allowed: true, source: "override-grant" });
  });

  it("role allow + override GRANT → allowed (source=role: role thắng đầu tiên)", async () => {
    // Role đã cho phép → không cần override-grant.
    findActiveOverrideMock.mockResolvedValue({
      granted: true,
      entity: "item",
      action: "read",
    });
    const r = await canForUser("u1", ["planner"], "read", "item");
    expect(r).toEqual({ allowed: true, source: "role" });
  });

  it("multi-role admin + override DENY → vẫn deny (deny wins)", async () => {
    findActiveOverrideMock.mockResolvedValue({
      granted: false,
      entity: "user",
      action: "delete",
    });
    const r = await canForUser("u1", ["admin", "planner"], "delete", "user");
    expect(r).toEqual({ allowed: false, source: "override-deny" });
  });

  it("expired override (filter ở repo) → null → fallback role", async () => {
    // `findActiveOverride` đã loại expired (NOT-EXISTS) → trả null
    findActiveOverrideMock.mockResolvedValue(null);
    const r = await canForUser("u1", ["operator"], "delete", "item");
    expect(r).toEqual({ allowed: false, source: "role" });
  });
});
