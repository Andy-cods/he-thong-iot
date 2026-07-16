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
  it("có đủ 8 role × 17 entity × 6 action (V3.9 thêm accountant)", () => {
    expect(Object.keys(RBAC_MATRIX)).toEqual([
      "admin",
      "planner",
      "operator",
      "warehouse",
      "purchaser",
      "qc",
      "display",
      "accountant",
    ]);
    expect(RBAC_ENTITIES).toHaveLength(17);
    expect(RBAC_ACTIONS).toHaveLength(6);
  });

  it("admin có quyền trên tất cả entity", () => {
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
    // V3.9 — operator/warehouse CÓ create pr (MRF GTAM) từ V3.7.55.
    ["operator", "create", "pr", true],
    ["warehouse", "create", "pr", true],
    // V3.9 — purchaser/qc/accountant cũng tự đề xuất mua vật tư.
    ["purchaser", "create", "pr", true],
    ["qc", "create", "pr", true],
    ["qc", "read", "pr", true],
    ["accountant", "create", "pr", true],
    ["accountant", "read", "pr", true],
    // PO
    ["admin", "approve", "po", true],
    ["planner", "approve", "po", false],
    ["purchaser", "approve", "po", false],
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
    // V3.8 — Production board: chỉ qc + admin CRUD; còn lại read-only.
    ["qc", "create", "productionBoard", true],
    ["qc", "update", "productionBoard", true],
    ["qc", "delete", "productionBoard", true],
    ["admin", "delete", "productionBoard", true],
    ["operator", "read", "productionBoard", true],
    ["operator", "create", "productionBoard", false],
    ["planner", "create", "productionBoard", false],
    ["qc", "approve", "pr", false],
    ["qc", "read", "wo", true],
    // V3.8.2 — Display kiosk: chỉ đọc bảng, không gì khác.
    ["display", "read", "productionBoard", true],
    ["display", "create", "productionBoard", false],
    ["display", "update", "productionBoard", false],
    ["display", "read", "wo", false],
    ["display", "read", "item", false],
    // V3.9 — Accountant: tạo + xem PR để tải PDF/Excel; KHÔNG duyệt/PO/board.
    ["accountant", "approve", "pr", false],
    ["accountant", "read", "po", false],
    ["accountant", "read", "productionBoard", false],
    ["accountant", "read", "user", true],
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

  it("planner true trên mọi entity nghiệp vụ (trừ inventory + report)", () => {
    // planner KHÔNG có inventory (thuộc warehouse) và report (KPI admin-only).
    const plannerExcluded: RbacEntity[] = ["inventory", "report"];
    for (const e of RBAC_ENTITIES) {
      if (plannerExcluded.includes(e)) {
        expect(canAny(["planner"], e)).toBe(false);
      } else {
        expect(canAny(["planner"], e)).toBe(true);
      }
    }
  });

  it("roles rỗng → false", () => {
    expect(canAny([], "item")).toBe(false);
    expect(canAny(null, "item")).toBe(false);
  });
});
