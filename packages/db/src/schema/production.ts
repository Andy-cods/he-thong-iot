import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
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
import { item } from "./master";
import { salesOrder } from "./order";
import { bomSnapshotLine } from "./snapshot";

/**
 * V1.3: thêm QUEUED (queue sau DRAFT) + PAUSED (sau IN_PROGRESS).
 * ALTER TYPE tại migration 0006a (superuser).
 */
export const workOrderStatusEnum = pgEnum("work_order_status", [
  "DRAFT",
  "QUEUED",
  "RELEASED",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
]);

/** Bảng 15a: work_order (V1.3 enhanced) */
export const workOrder = appSchema.table(
  "work_order",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    woNo: varchar("wo_no", { length: 64 }).notNull(),
    productItemId: uuid("product_item_id")
      .notNull()
      .references(() => item.id),
    linkedOrderId: uuid("linked_order_id").references(() => salesOrder.id),
    plannedQty: numeric("planned_qty", { precision: 18, scale: 4 }).notNull(),
    goodQty: numeric("good_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    scrapQty: numeric("scrap_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    status: workOrderStatusEnum("status").notNull().default("DRAFT"),
    priority: varchar("priority", { length: 16 }).notNull().default("NORMAL"),
    plannedStart: date("planned_start"),
    plannedEnd: date("planned_end"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pausedReason: text("paused_reason"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    versionLock: integer("version_lock").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    woNoIdx: uniqueIndex("work_order_no_uk").on(t.woNo),
    statusIdx: index("work_order_status_idx").on(t.status),
    productIdx: index("work_order_product_idx").on(t.productItemId),
  }),
);

/** Bảng 15b: work_order_progress */
export const workOrderProgress = appSchema.table(
  "work_order_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    woId: uuid("wo_id")
      .notNull()
      .references(() => workOrder.id, { onDelete: "cascade" }),
    reportedAt: timestamp("reported_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    reportedBy: uuid("reported_by").references(() => userAccount.id),
    goodQty: numeric("good_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    scrapQty: numeric("scrap_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    percentCompleted: numeric("percent_completed", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes"),
  },
  (t) => ({
    woIdx: index("wo_progress_wo_idx").on(t.woId, t.reportedAt),
  }),
);

/** V1.3 — Bảng work_order_line: link 1 WO → N snapshot_lines */
export const workOrderLine = appSchema.table(
  "work_order_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    woId: uuid("wo_id")
      .notNull()
      .references(() => workOrder.id, { onDelete: "cascade" }),
    snapshotLineId: uuid("snapshot_line_id")
      .notNull()
      .references(() => bomSnapshotLine.id),
    requiredQty: numeric("required_qty", { precision: 18, scale: 4 }).notNull(),
    completedQty: numeric("completed_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    position: integer("position").notNull().default(0),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    woIdx: index("work_order_line_wo_idx").on(t.woId),
    snapIdx: index("work_order_line_snap_idx").on(t.snapshotLineId),
    uniqSnap: uniqueIndex("work_order_line_unique_snap").on(
      t.woId,
      t.snapshotLineId,
    ),
  }),
);

export type WorkOrder = typeof workOrder.$inferSelect;
export type NewWorkOrder = typeof workOrder.$inferInsert;
export type WorkOrderProgress = typeof workOrderProgress.$inferSelect;
export type WorkOrderLine = typeof workOrderLine.$inferSelect;
export type NewWorkOrderLine = typeof workOrderLine.$inferInsert;
export type WorkOrderStatus = (typeof workOrderStatusEnum.enumValues)[number];
