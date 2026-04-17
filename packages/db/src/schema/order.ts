import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { bomTemplate, bomLine } from "./bom";
import { item } from "./master";

export const salesOrderStatusEnum = pgEnum("sales_order_status", [
  "DRAFT",
  "CONFIRMED",
  "SNAPSHOTTED",
  "IN_PROGRESS",
  "FULFILLED",
  "CLOSED",
  "CANCELLED",
]);

/** Bảng 11: sales_order */
export const salesOrder = appSchema.table(
  "sales_order",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderNo: varchar("order_no", { length: 64 }).notNull(),
    customerName: varchar("customer_name", { length: 255 }).notNull(),
    customerRef: varchar("customer_ref", { length: 128 }),
    status: salesOrderStatusEnum("status").notNull().default("DRAFT"),
    productItemId: uuid("product_item_id")
      .notNull()
      .references(() => item.id),
    // V1.1-alpha: bom_revision removed → trỏ thẳng bom_template
    bomTemplateId: uuid("bom_template_id").references(() => bomTemplate.id),
    orderQty: numeric("order_qty", { precision: 18, scale: 4 }).notNull(),
    dueDate: date("due_date"),
    notes: text("notes"),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }),
    snapshotBy: uuid("snapshot_by").references(() => userAccount.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    orderNoIdx: uniqueIndex("sales_order_no_uk").on(t.orderNo),
    statusIdx: index("sales_order_status_idx").on(t.status),
    productIdx: index("sales_order_product_idx").on(t.productItemId),
  }),
);

/** Bảng 12: order_bom_snapshot — BẤT BIẾN sau khi snapshot */
export const orderBomSnapshot = appSchema.table(
  "order_bom_snapshot",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => salesOrder.id, { onDelete: "cascade" }),
    sourceBomLineId: uuid("source_bom_line_id").references(() => bomLine.id),
    level: integer("level").notNull(),
    linePath: text("line_path").notNull(),
    parentItemId: uuid("parent_item_id")
      .notNull()
      .references(() => item.id),
    childItemId: uuid("child_item_id")
      .notNull()
      .references(() => item.id),
    qtyPer: numeric("qty_per", { precision: 18, scale: 6 }).notNull(),
    scrapPct: numeric("scrap_pct", { precision: 6, scale: 3 })
      .notNull()
      .default("0"),
    requiredQty: numeric("required_qty", { precision: 18, scale: 4 })
      .notNull(),
    reservedQty: numeric("reserved_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    consumedQty: numeric("consumed_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    positionNo: integer("position_no").notNull().default(1),
    refDesignator: varchar("ref_designator", { length: 128 }),
    frozenAt: timestamp("frozen_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    orderIdx: index("order_bom_snapshot_order_idx").on(t.orderId),
    pathIdx: index("order_bom_snapshot_path_idx").on(t.orderId, t.linePath),
    childIdx: index("order_bom_snapshot_child_idx").on(t.childItemId),
  }),
);

export type SalesOrder = typeof salesOrder.$inferSelect;
export type OrderBomSnapshot = typeof orderBomSnapshot.$inferSelect;
