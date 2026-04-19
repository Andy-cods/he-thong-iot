import { sql } from "drizzle-orm";
import {
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
import { bomLine, bomRevision, bomTemplate } from "./bom";
import { item } from "./master";

/** V1.3 ECO workflow status. */
export const ecoStatusEnum = pgEnum("eco_status", [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "APPLIED",
  "REJECTED",
]);

/** V1.3 ECO change action. */
export const ecoActionTypeEnum = pgEnum("eco_action_type", [
  "ADD_LINE",
  "REMOVE_LINE",
  "UPDATE_QTY",
  "UPDATE_SCRAP",
  "REPLACE_COMPONENT",
]);

/** Bảng eco_change — header + workflow state. */
export const ecoChange = appSchema.table(
  "eco_change",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    title: varchar("title", { length: 256 }).notNull(),
    description: text("description"),
    status: ecoStatusEnum("status").notNull().default("DRAFT"),
    affectedTemplateId: uuid("affected_template_id")
      .notNull()
      .references(() => bomTemplate.id),
    oldRevisionId: uuid("old_revision_id").references(() => bomRevision.id),
    newRevisionId: uuid("new_revision_id").references(() => bomRevision.id),
    requestedBy: uuid("requested_by").references(() => userAccount.id),
    approvedBy: uuid("approved_by").references(() => userAccount.id),
    appliedBy: uuid("applied_by").references(() => userAccount.id),
    rejectedBy: uuid("rejected_by").references(() => userAccount.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    affectedOrdersCount: integer("affected_orders_count").notNull().default(0),
    applyJobId: varchar("apply_job_id", { length: 64 }),
    applyProgress: integer("apply_progress").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    codeUk: uniqueIndex("eco_change_code_uk").on(t.code),
    statusIdx: index("eco_change_status_idx").on(t.status),
    templateIdx: index("eco_change_template_idx").on(t.affectedTemplateId),
  }),
);

/** Bảng eco_line — delta per-line. */
export const ecoLine = appSchema.table(
  "eco_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ecoId: uuid("eco_id")
      .notNull()
      .references(() => ecoChange.id, { onDelete: "cascade" }),
    action: ecoActionTypeEnum("action").notNull(),
    targetLineId: uuid("target_line_id").references(() => bomLine.id),
    componentItemId: uuid("component_item_id").references(() => item.id),
    qtyPerParent: numeric("qty_per_parent", { precision: 18, scale: 6 }),
    scrapPercent: numeric("scrap_percent", { precision: 6, scale: 3 }),
    description: text("description"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    ecoIdx: index("eco_line_eco_idx").on(t.ecoId),
  }),
);

export type EcoChange = typeof ecoChange.$inferSelect;
export type NewEcoChange = typeof ecoChange.$inferInsert;
export type EcoLine = typeof ecoLine.$inferSelect;
export type NewEcoLine = typeof ecoLine.$inferInsert;
export type EcoStatus = (typeof ecoStatusEnum.enumValues)[number];
export type EcoActionType = (typeof ecoActionTypeEnum.enumValues)[number];
