import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";

/**
 * V3.7.62 — KPI Targets cho Employee Productivity Report.
 * Admin set baseline target cho mỗi (role, metric, period_type) → hiển thị
 * "đạt / chưa đạt" trên MetricCard của employee report.
 *
 * Migration: 0045_report_targets.sql
 */
export const reportTarget = appSchema.table(
  "report_target",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Role áp dụng. NULL = mọi role. */
    roleCode: varchar("role_code", { length: 32 }),
    /** Metric ID khớp với repo employeeProductivity.ts. */
    metricId: varchar("metric_id", { length: 64 }).notNull(),
    /** monthly / quarterly / yearly. */
    periodType: varchar("period_type", { length: 16 })
      .notNull()
      .default("monthly"),
    /** Numeric target (count hoặc sum). */
    targetValue: numeric("target_value", { precision: 18, scale: 4 }).notNull(),
    /** gte (≥, default) hoặc lte (≤ cho metric "càng thấp càng tốt" như scrap). */
    comparison: varchar("comparison", { length: 8 }).notNull().default("gte"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedBy: uuid("updated_by").references(() => userAccount.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    uniqueActive: uniqueIndex("report_target_unique_active")
      .on(t.roleCode, t.metricId, t.periodType)
      .where(sql`${t.isActive} = TRUE`),
    roleIdx: index("report_target_role_idx").on(t.roleCode, t.isActive),
  }),
);

export type ReportTarget = typeof reportTarget.$inferSelect;
export type NewReportTarget = typeof reportTarget.$inferInsert;
