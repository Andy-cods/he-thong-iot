import { describe, expect, it } from "vitest";
import type { Role } from "../types";
import { can, canAny } from "./can";
import {
  RBAC_ACTIONS,
  RBAC_ENTITIES,
  RBAC_MATRIX,
  type RbacAction,
  type RbacEntity,
} from "./matrix";

describe("RBAC matrix — shape + consistency", () => {
  it("có đủ 4 role × 13 entity × 6 action", () => {
    expect(Object.keys(RBAC_MATRIX)).toEqual([
      "admin",
      "planner",
      "operator",
      "warehouse",
    ]);
    expect(RBAC_ENTITIES).toHaveLength(13);
    expect(RBAC_ACTIONS).toHaveLength(6);
  });

  it("admin có quyền trên tất cả 13 entity", () => {
    for (const e of RBAC_ENTITIES) {
      expect(RBAC_MATRIX.admin[e]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("can() — deny-by-default + null guards", () => {
  it("roles rỗng / null / undefined → false", () => {
    expect(can([], "read", "item")).toBe(false);
    expect(can(null, "read", "item")).toBe(false);
    expect(can(undefined, "read", "item")).toBe(false);
  });

  it("entity có action → true", () => {
    expect(can(["planner"], "create", "item")).toBe(true);
  });

  it("entity chưa khai báo trong matrix → false", () => {
    // operator không có supplier → deny
    expect(can(["operator"], "read", "supplier")).toBe(false);
  });

  it("multi-role OR: ít nhất 1 role thỏa mãn là true", () => {
    expect(can(["operator", "planner"], "create", "item")).toBe(true);
    expect(can(["operator", "warehouse"], "delete", "item")).toBe(false);
  });
});

describe("can() — assert 48+ cell từ matrix (§4 brainstorm)", () => {
  // Format: [role, action, entity, expected]
  const cases: Array<[Role, RbacAction, RbacEntity, boolean]> = [
    // Item
    ["admin", "create", "item", true],
    ["admin", "delete", "item", true],
    ["planner", "create", "item", true],
    ["planner", "delete", "item", false],
    ["operator", "read", "item", true],
    ["operator", "create", "item", false],
    ["warehouse", "read", "item", true],
    ["warehouse", "update", "item", false],
    // Supplier
    ["planner", "create", "supplier", true],
    ["warehouse", "read", "supplier", true],
    ["operator", "read", "supplier", false],
    // BOM Template
    ["admin", "delete", "bomTemplate", true],
    ["planner", "update", "bomTemplate", true],
    ["operator", "read", "bomTemplate", true],
    ["operator", "create", "bomTemplate", false],
    // BOM Revision (có approve)
    ["planner", "approve", "bomRevision", true],
    ["operator", "approve", "bomRevision", false],
    // Sales Order
    ["planner", "transition", "salesOrder", true],
    ["planner", "delete", "salesOrder", false],
    ["operator", "read", "salesOrder", true],
    // BOM Snapshot (transition quan trọng)
    ["operator", "transition", "bomSnapshot", true],
    ["warehouse", "transition", "bomSnapshot", true],
    ["planner", "transition", "bomSnapshot", true],
    // PR
    ["planner", "approve", "pr", true],
    ["operator", "read", "pr", true],
    ["operator", "create", "pr", false],
    // PO
    ["planner", "approve", "po", true],
    ["warehouse", "transition", "po", true],
    ["warehouse", "update", "po", true],
    ["operator", "update", "po", false],
    // WO
    ["planner", "transition", "wo", true],
    ["operator", "transition", "wo", true],
    ["warehouse", "transition", "wo", false],
    ["planner", "delete", "wo", false],
    ["admin", "delete", "wo", true],
    // Reservation
    ["planner", "create", "reservation", true],
    ["operator", "transition", "reservation", true],
    ["warehouse", "create", "reservation", false],
    // ECO
    ["planner", "approve", "eco", true],
    ["operator", "read", "eco", true],
    ["operator", "approve", "eco", false],
    // Audit
    ["admin", "read", "audit", true],
    ["planner", "read", "audit", true],
    ["operator", "read", "audit", true],
    ["warehouse", "read", "audit", true],
    ["operator", "update", "audit", false],
    // User
    ["admin", "create", "user", true],
    ["planner", "read", "user", true],
    ["planner", "create", "user", false],
    ["operator", "read", "user", true],
    ["operator", "update", "user", false],
  ];

  it.each(cases)(
    "can([%s], %s, %s) === %s",
    (role, action, entity, expected) => {
      expect(can([role], action, entity)).toBe(expected);
    },
  );

  it(`tổng ${cases.length} cell ≥ 48`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(48);
  });
});

describe("canAny() — nav filter shortcut", () => {
  it("admin luôn true cho entity bất kỳ", () => {
    for (const e of RBAC_ENTITIES) {
      expect(canAny(["admin"], e)).toBe(true);
    }
  });

  it("operator false trên supplier (không khai báo)", () => {
    expect(canAny(["operator"], "supplier")).toBe(false);
  });

  it("planner true trên mọi entity nghiệp vụ", () => {
    for (const e of RBAC_ENTITIES) {
      expect(canAny(["planner"], e)).toBe(true);
    }
  });

  it("roles rỗng → false", () => {
    expect(canAny([], "item")).toBe(false);
    expect(canAny(null, "item")).toBe(false);
  });
});
