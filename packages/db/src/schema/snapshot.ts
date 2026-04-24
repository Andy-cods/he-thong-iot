import { sql } from "drizzle-orm";
import {
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  text,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { bomRevision } from "./bom";
import { item } from "./master";
import { salesOrder } from "./order";

/**
 * 10-state enum cho BOM snapshot line (V1.2 core).
 * V1.2 enable flow: PLANNED → PURCHASING → INBOUND_QC → AVAILABLE → RESERVED → CLOSED
 * V1.3 mở: IN_PRODUCTION, PROD_QC, ISSUED, ASSEMBLED (WO + Assembly).
 */
export const bomSnapshotLineStateEnum = pgEnum("bom_snapshot_line_state", [
  "PLANNED",
  "PURCHASING",
  "IN_PRODUCTION",
  "INBOUND_QC",
  "PROD_QC",
  "AVAILABLE",
  "RESERVED",
  "ISSUED",
  "ASSEMBLED",
  "CLOSED",
]);

/**
 * ltree custom type — Postgres native `ltree` (extension `ltree` required).
 * Lưu path tree: `001.002.003` (dot-separated), GIST index support ancestor/descendant.
 */
const ltree = customType<{ data: string; driverData: string }>({
  dataType() {
    return "ltree";
  },
});

/**
 * Bảng 12 (V1.2 mới): bom_snapshot_line — kết quả explode recursive CTE
 * của 1 revision cho 1 sales_order.
 *
 * CỘT `remaining_short_qty` là GENERATED STORED:
 *   GREATEST(0, gross_required_qty - qc_pass_qty - reserved_qty - issued_qty - assembled_qty)
 * Drizzle chưa native support GENERATED; migration SQL (0005c) đã tạo,
 * nhưng schema TS khai báo cột readonly numeric (select-only, không insert).
 */
export const bomSnapshotLine = appSchema.table(
  "bom_snapshot_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => salesOrder.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => bomRevision.id),
    parentSnapshotLineId: uuid("parent_snapshot_line_id"),
    level: integer("level").notNull(),
    path: ltree("path").notNull(),
    componentItemId: uuid("component_item_id")
      .notNull()
      .references(() => item.id),
    componentSku: varchar("component_sku", { length: 64 }).notNull(),
    componentName: varchar("component_name", { length: 256 }).notNull(),
    requiredQty: numeric("required_qty", { precision: 18, scale: 6 }).notNull(),
    grossRequiredQty: numeric("gross_required_qty", {
      precision: 18,
      scale: 6,
    }).notNull(),
    openPurchaseQty: numeric("open_purchase_qty", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    receivedQty: numeric("received_qty", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    qcPassQty: numeric("qc_pass_qty", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    reservedQty: numeric("reserved_qty", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    issuedQty: numeric("issued_qty", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    assembledQty: numeric("assembled_qty", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    /**
     * GENERATED ALWAYS AS (...) STORED — do migration SQL quản lý.
     * Drizzle chưa có first-class support GENERATED column; khai báo
     * readonly numeric để select-only, không insert/update từ app.
     */
    remainingShortQty: numeric("remaining_short_qty", {
      precision: 18,
      scale: 6,
    }),
    state: bomSnapshotLineStateEnum("state").notNull().default("PLANNED"),
    transitionedAt: timestamp("transitioned_at", { withTimezone: true }),
    transitionedBy: uuid("transitioned_by").references(() => userAccount.id),
    versionLock: integer("version_lock").notNull().default(0),
    /** V1.9 Phase 3: ghi chú tự do cho snapshot line. */
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    parentFk: foreignKey({
      columns: [t.parentSnapshotLineId],
      foreignColumns: [t.id as AnyPgColumn],
      name: "bom_snapshot_line_parent_fk",
    }).onDelete("cascade"),
    orderIdx: index("bom_snapshot_line_order_idx").on(t.orderId),
    revisionIdx: index("bom_snapshot_line_revision_idx").on(t.revisionId),
    parentIdx: index("bom_snapshot_line_parent_idx").on(t.parentSnapshotLineId),
    componentIdx: index("bom_snapshot_line_component_idx").on(
      t.componentItemId,
    ),
    stateIdx: index("bom_snapshot_line_state_idx").on(t.state),
    orderStateIdx: index("bom_snapshot_line_order_state_idx").on(
      t.orderId,
      t.state,
    ),
  }),
);

export type BomSnapshotLine = typeof bomSnapshotLine.$inferSelect;
export type NewBomSnapshotLine = typeof bomSnapshotLine.$inferInsert;
export type BomSnapshotLineState =
  (typeof bomSnapshotLineStateEnum.enumValues)[number];

