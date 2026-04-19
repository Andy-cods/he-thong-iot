import { sql } from "drizzle-orm";
import {
  index,
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

export type QcCheck = typeof qcCheck.$inferSelect;
export type NewQcCheck = typeof qcCheck.$inferInsert;
export type QcCheckResult = (typeof qcCheckResultEnum.enumValues)[number];
export type QcCheckpoint = (typeof qcCheckpointEnum.enumValues)[number];
