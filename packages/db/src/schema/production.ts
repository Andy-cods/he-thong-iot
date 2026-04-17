import { sql } from "drizzle-orm";
import {
  date,
  index,
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

export const workOrderStatusEnum = pgEnum("work_order_status", [
  "DRAFT",
  "RELEASED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

/** Bảng 15a: work_order */
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
    plannedStart: date("planned_start"),
    plannedEnd: date("planned_end"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
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

export type WorkOrder = typeof workOrder.$inferSelect;
export type WorkOrderProgress = typeof workOrderProgress.$inferSelect;
