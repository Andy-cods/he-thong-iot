import { sql } from "drizzle-orm";
import {
  boolean,
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
import { item } from "./master";

export const bomRevisionStatusEnum = pgEnum("bom_revision_status", [
  "DRAFT",
  "RELEASED",
  "OBSOLETE",
]);

/** Bảng 8: bom_template */
export const bomTemplate = appSchema.table(
  "bom_template",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    productItemId: uuid("product_item_id")
      .notNull()
      .references(() => item.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    codeIdx: uniqueIndex("bom_template_code_uk").on(t.code),
    productIdx: index("bom_template_product_idx").on(t.productItemId),
  }),
);

/** Bảng 9: bom_revision */
export const bomRevision = appSchema.table(
  "bom_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => bomTemplate.id, { onDelete: "cascade" }),
    revCode: varchar("rev_code", { length: 16 }).notNull(),
    status: bomRevisionStatusEnum("status").notNull().default("DRAFT"),
    notes: text("notes"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedBy: uuid("released_by").references(() => userAccount.id),
    obsoletedAt: timestamp("obsoleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    uniq: uniqueIndex("bom_revision_uk").on(t.templateId, t.revCode),
    statusIdx: index("bom_revision_status_idx").on(t.status),
  }),
);

/** Bảng 10: bom_line */
export const bomLine = appSchema.table(
  "bom_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => bomRevision.id, { onDelete: "cascade" }),
    parentItemId: uuid("parent_item_id")
      .notNull()
      .references(() => item.id),
    childItemId: uuid("child_item_id")
      .notNull()
      .references(() => item.id),
    positionNo: integer("position_no").notNull().default(1),
    qtyPer: numeric("qty_per", { precision: 18, scale: 6 }).notNull(),
    scrapPct: numeric("scrap_pct", { precision: 6, scale: 3 })
      .notNull()
      .default("0"),
    refDesignator: varchar("ref_designator", { length: 128 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    revIdx: index("bom_line_rev_idx").on(t.revisionId),
    parentIdx: index("bom_line_parent_idx").on(t.revisionId, t.parentItemId),
    childIdx: index("bom_line_child_idx").on(t.childItemId),
    uniq: uniqueIndex("bom_line_uk").on(
      t.revisionId,
      t.parentItemId,
      t.childItemId,
      t.positionNo,
    ),
  }),
);

export type BomTemplate = typeof bomTemplate.$inferSelect;
export type BomRevision = typeof bomRevision.$inferSelect;
export type BomLine = typeof bomLine.$inferSelect;
