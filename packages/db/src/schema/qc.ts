import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { workOrder } from "./production";

/** V1.3 QC check result. */
export const qcCheckResultEnum = pgEnum("qc_check_result", [
  "PASS",
  "FAIL",
  "NA",
]);

/** V1.3 hardcode 3 checkpoint. */
export const qcCheckpointEnum = pgEnum("qc_checkpoint", [
  "PRE_ASSEMBLY",
  "MID_PRODUCTION",
  "PRE_FG",
]);

/** Bảng qc_check — stub V1.3. */
export const qcCheck = appSchema.table(
  "qc_check",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    woId: uuid("wo_id")
      .notNull()
      .references(() => workOrder.id, { onDelete: "cascade" }),
    checkpointName: varchar("checkpoint_name", { length: 128 }).notNull(),
    checkpoint: qcCheckpointEnum("checkpoint"),
    result: qcCheckResultEnum("result"),
    note: text("note"),
    checkedBy: uuid("checked_by").references(() => userAccount.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    woIdx: index("qc_check_wo_idx").on(t.woId, t.checkedAt),
  }),
);

/**
 * V1.9-P4 — qc_check_item: checklist chi tiết per QC stage.
 * Cho phép 1 qc_check có N items (kích thước, bề mặt, visual).
 * result: PENDING | PASS | FAIL | NA (varchar, không enum để linh hoạt).
 * check_type: BOOLEAN | MEASUREMENT | VISUAL.
 */
export const qcCheckItem = appSchema.table(
  "qc_check_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    qcCheckId: uuid("qc_check_id")
      .notNull()
      .references(() => qcCheck.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    checkType: varchar("check_type", { length: 50 })
      .notNull()
      .default("BOOLEAN"),
    expectedValue: varchar("expected_value", { length: 100 }),
    actualValue: varchar("actual_value", { length: 100 }),
    result: varchar("result", { length: 20 }).notNull().default("PENDING"),
    defectReason: text("defect_reason"),
    photoUrl: text("photo_url"),
    checkedBy: uuid("checked_by").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    checkIdx: index("qc_check_item_check_idx").on(t.qcCheckId, t.sortOrder),
  }),
);

export type QcCheck = typeof qcCheck.$inferSelect;
export type NewQcCheck = typeof qcCheck.$inferInsert;
export type QcCheckResult = (typeof qcCheckResultEnum.enumValues)[number];
export type QcCheckpoint = (typeof qcCheckpointEnum.enumValues)[number];
export type QcCheckItem = typeof qcCheckItem.$inferSelect;
export type NewQcCheckItem = typeof qcCheckItem.$inferInsert;
export type QcCheckItemResult = "PENDING" | "PASS" | "FAIL" | "NA";
export type QcCheckItemType = "BOOLEAN" | "MEASUREMENT" | "VISUAL";
