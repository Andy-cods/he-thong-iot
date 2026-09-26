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
  it("có đủ 9 role × 22 entity × 6 action (V4.1 Đợt 1a goodsIssue + qcInspection, 1b materialRequest)", () => {
    expect(Object.keys(RBAC_MATRIX)).toEqual([
      "admin",
      "planner",
      "operator",
      "warehouse",
      "purchaser",
      "qc",
      "display",
      "accountant",
      "shareholder",
    ]);
    expect(RBAC_ENTITIES).toHaveLength(22);
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
    // V4.0 — planner MẤT quyền duyệt PR: bước 2 (Trưởng bộ phận) chuyển sang
    // Kho (kiểm tồn rồi duyệt), bước 3 là Giám đốc (admin) / Thu mua.
    ["planner", "approve", "pr", false],
    ["warehouse", "approve", "pr", true],
    ["admin", "approve", "pr", true],
    ["purchaser", "approve", "pr", true],
    ["operator", "approve", "pr", false],
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
    ["accountant", "read", "productionBoard", false],
    ["accountant", "read", "user", true],
    // V4.0 — Accountant sở hữu phân hệ Tài chính, đọc PO + BBGH để đối chiếu.
    ["accountant", "create", "finance", true],
    ["accountant", "update", "finance", true],
    ["accountant", "delete", "finance", false], // huỷ chứng từ bằng VOID
    ["accountant", "approve", "finance", false], // duyệt chi là của Giám đốc
    ["accountant", "read", "po", true],
    ["accountant", "read", "deliveryNote", true],
    // V4.0 — Shareholder (Cổ đông): CHỈ đọc Tài chính + tiến độ sản xuất.
    ["shareholder", "read", "finance", true],
    ["shareholder", "read", "productionBoard", true],
    ["shareholder", "create", "finance", false],
    ["shareholder", "update", "finance", false],
    ["shareholder", "delete", "finance", false],
    ["shareholder", "approve", "finance", false],
    ["shareholder", "update", "productionBoard", false],
    // Cổ đông KHÔNG thấy nghiệp vụ chi tiết (BOM/PR/PO/vật tư/NCC/kho).
    ["shareholder", "read", "pr", false],
    ["shareholder", "read", "po", false],
    ["shareholder", "read", "item", false],
    ["shareholder", "read", "supplier", false],
    ["shareholder", "read", "bomTemplate", false],
    ["shareholder", "read", "inventory", false],
    ["shareholder", "read", "deliveryNote", false],
    // V4.0 — Phiếu giao hàng: chỉ Giám đốc (admin) duyệt.
    ["admin", "approve", "deliveryNote", true],
    ["warehouse", "create", "deliveryNote", true],
    ["warehouse", "approve", "deliveryNote", false],
    ["purchaser", "read", "deliveryNote", true],
    ["purchaser", "approve", "deliveryNote", false],
    ["operator", "read", "deliveryNote", false],
    // V4.1 Đợt 1a — QC nhập kho: chỉ qc + admin kết luận Đạt/Không đạt.
    ["qc", "approve", "qcInspection", true],
    ["qc", "update", "qcInspection", true],
    ["admin", "approve", "qcInspection", true],
    ["planner", "approve", "qcInspection", false],
    ["planner", "update", "qcInspection", false],
    ["warehouse", "approve", "qcInspection", false],
    ["warehouse", "update", "qcInspection", true],
    ["warehouse", "read", "qcInspection", true],
    ["purchaser", "read", "qcInspection", false],
    // V4.1 Đợt 1a — Xuất kho: kho xuất nội bộ, bán/trả NCC chỉ Giám đốc.
    ["warehouse", "create", "goodsIssue", true],
    ["warehouse", "approve", "goodsIssue", false],
    ["purchaser", "create", "goodsIssue", false],
    ["admin", "approve", "goodsIssue", true],
    ["planner", "read", "goodsIssue", true],
    ["planner", "create", "goodsIssue", false],
    ["qc", "read", "goodsIssue", false],
    // V4.1 Đợt 1b — Phiếu yêu cầu vật tư: xưởng (operator) tự lập phiếu;
    // Kho chuẩn bị/huỷ nhưng không lập; QC/Thu mua không đụng.
    ["operator", "create", "materialRequest", true],
    ["operator", "read", "materialRequest", true],
    ["operator", "transition", "materialRequest", false],
    ["planner", "create", "materialRequest", true],
    ["planner", "transition", "materialRequest", false],
    ["warehouse", "transition", "materialRequest", true],
    ["warehouse", "create", "materialRequest", false],
    ["admin", "transition", "materialRequest", true],
    ["qc", "read", "materialRequest", false],
    ["purchaser", "read", "materialRequest", false],
    ["accountant", "read", "materialRequest", false],
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

  it("planner true trên mọi entity nghiệp vụ (trừ inventory, report, finance, deliveryNote)", () => {
    // planner KHÔNG có inventory (thuộc warehouse), report (KPI admin-only),
    // finance (V4.0 — thuộc kế toán) và deliveryNote (V4.0 — thuộc kho).
    // V4.1 Đợt 1a — qcInspection: planner mất quyền HOLD/nhả HOLD (KHO-12).
    const plannerExcluded: RbacEntity[] = [
      "inventory",
      "report",
      "finance",
      "deliveryNote",
      "qcInspection",
    ];
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
