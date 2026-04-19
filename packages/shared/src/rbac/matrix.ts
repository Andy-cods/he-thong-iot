import type { Role } from "../types";

/**
 * V1.4 RBAC matrix — 13 entity × 6 action × 4 role.
 *
 * Quy ước:
 * - Action cố định: create | read | update | delete | approve | transition.
 * - Entity là domain-concept (không phải table name) — ví dụ `bomTemplate`
 *   ↔ app.bom_template, `salesOrder` ↔ app.sales_order.
 * - Multi-role (OR): user có nhiều role → hợp quyền của cả nhóm.
 *
 * Khi thêm entity/action mới: cập nhật cả RBAC_MATRIX + type union + test.
 */
export type RbacAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "approve"
  | "transition";

export type RbacEntity =
  | "item"
  | "supplier"
  | "bomTemplate"
  | "bomRevision"
  | "salesOrder"
  | "bomSnapshot"
  | "pr"
  | "po"
  | "wo"
  | "reservation"
  | "eco"
  | "audit"
  | "user";

/** Partial vì không phải role nào cũng có action trên mọi entity. */
type Matrix = Record<Role, Partial<Record<RbacEntity, RbacAction[]>>>;

/**
 * Matrix chính — tham chiếu duy nhất cho `can()` + UI nav + API guard.
 * - Admin: full quyền trên mọi entity (bao gồm approve/transition/delete).
 * - Planner: CRUD nghiệp vụ (item/supplier/bom/order/snapshot/WO/PR);
 *   APPROVE PR + ECO; TRANSITION snapshot/WO; READ audit.
 * - Operator: READ base; CREATE receiving qua WO; TRANSITION WO/AO/snapshot
 *   (RESERVED→ISSUED→ASSEMBLED).
 * - Warehouse: READ base; CREATE receiving_event; TRANSITION snapshot
 *   (INBOUND_QC→AVAILABLE) + PO (nhận hàng).
 */
export const RBAC_MATRIX: Matrix = {
  admin: {
    item: ["create", "read", "update", "delete"],
    supplier: ["create", "read", "update", "delete"],
    bomTemplate: ["create", "read", "update", "delete"],
    bomRevision: ["create", "read", "update", "delete", "approve"],
    salesOrder: ["create", "read", "update", "delete", "approve", "transition"],
    bomSnapshot: ["create", "read", "update", "transition"],
    pr: ["create", "read", "update", "delete", "approve"],
    po: ["create", "read", "update", "delete", "approve", "transition"],
    wo: ["create", "read", "update", "delete", "approve", "transition"],
    reservation: ["create", "read", "update", "delete", "transition"],
    eco: ["create", "read", "update", "delete", "approve"],
    audit: ["read"],
    user: ["create", "read", "update", "delete"],
  },
  planner: {
    item: ["create", "read", "update"],
    supplier: ["create", "read", "update"],
    bomTemplate: ["create", "read", "update"],
    bomRevision: ["create", "read", "update", "approve"],
    salesOrder: ["create", "read", "update", "transition"],
    bomSnapshot: ["create", "read", "transition"],
    pr: ["create", "read", "update", "approve"],
    po: ["create", "read", "update", "approve"],
    wo: ["create", "read", "update", "transition"],
    reservation: ["create", "read", "update", "transition"],
    eco: ["create", "read", "update", "approve"],
    audit: ["read"],
    user: ["read"],
  },
  operator: {
    item: ["read"],
    bomTemplate: ["read"],
    bomRevision: ["read"],
    salesOrder: ["read"],
    bomSnapshot: ["read", "transition"],
    pr: ["read"],
    po: ["read"],
    wo: ["read", "transition"],
    reservation: ["read", "transition"],
    eco: ["read"],
    audit: ["read"],
    user: ["read"],
  },
  warehouse: {
    item: ["read"],
    supplier: ["read"],
    bomTemplate: ["read"],
    bomRevision: ["read"],
    salesOrder: ["read"],
    bomSnapshot: ["read", "transition"],
    pr: ["read"],
    po: ["read", "update", "transition"],
    wo: ["read"],
    reservation: ["read"],
    eco: ["read"],
    audit: ["read"],
    user: ["read"],
  },
};

/** Danh sách entity/action để iterate khi build test hoặc UI. */
export const RBAC_ENTITIES: RbacEntity[] = [
  "item",
  "supplier",
  "bomTemplate",
  "bomRevision",
  "salesOrder",
  "bomSnapshot",
  "pr",
  "po",
  "wo",
  "reservation",
  "eco",
  "audit",
  "user",
];

export const RBAC_ACTIONS: RbacAction[] = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "transition",
];
