import { sql } from "drizzle-orm";
import {
  bigserial,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { bomTemplate } from "./bom";
import { item, supplier } from "./master";

/**
 * V1.5 BOM Core Redesign — Trụ cột 1.
 *
 *  - `product_line`      : nhóm nhiều bom_template (mã Z) thành dòng sản phẩm.
 *  - `product_line_member`: M2M giữa product_line ↔ bom_template.
 *  - `activity_log`      : append-only audit trail (trigger chặn UPDATE/DELETE).
 *  - `alias_supplier`    : map tên viết tắt NCC Excel → supplier.id.
 *  - `alias_item`        : map tên linh kiện không chuẩn Excel → item.id.
 *
 * @see plans/bom-core-redesign/01-schema.md
 */

export const productLine = appSchema.table(
  "product_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    ownerUserId: uuid("owner_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 16 }).notNull().default("ACTIVE"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    codeUk: uniqueIndex("product_line_code_uk").on(t.code),
    statusIdx: index("product_line_status_idx").on(t.status),
  }),
);

export const productLineMember = appSchema.table(
  "product_line_member",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productLineId: uuid("product_line_id")
      .notNull()
      .references(() => productLine.id, { onDelete: "cascade" }),
    bomTemplateId: uuid("bom_template_id")
      .notNull()
      .references(() => bomTemplate.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(1),
    role: varchar("role", { length: 32 }).default("MAIN"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    uk: uniqueIndex("product_line_member_uk").on(
      t.productLineId,
      t.bomTemplateId,
    ),
    bomIdx: index("product_line_member_bom_idx").on(t.bomTemplateId),
  }),
);

export const activityLog = appSchema.table(
  "activity_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    diffJson: jsonb("diff_json").notNull().default(sql`'{}'::jsonb`),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    at: timestamp("at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    entityIdx: index("activity_log_entity_idx").on(
      t.entityType,
      t.entityId,
      t.at,
    ),
    userIdx: index("activity_log_user_idx").on(t.userId, t.at),
  }),
);

export const aliasSupplier = appSchema.table(
  "alias_supplier",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alias: varchar("alias", { length: 128 }).notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "cascade" }),
    confidence: numeric("confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("1.0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    aliasUk: uniqueIndex("alias_supplier_alias_uk").on(sql`lower(${t.alias})`),
    supplierIdx: index("alias_supplier_supplier_idx").on(t.supplierId),
  }),
);

export const aliasItem = appSchema.table(
  "alias_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alias: varchar("alias", { length: 255 }).notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    confidence: numeric("confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("1.0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    aliasUk: uniqueIndex("alias_item_alias_uk").on(sql`lower(${t.alias})`),
    itemIdx: index("alias_item_item_idx").on(t.itemId),
  }),
);

export type ProductLine = typeof productLine.$inferSelect;
export type NewProductLine = typeof productLine.$inferInsert;
export type ProductLineMember = typeof productLineMember.$inferSelect;
export type NewProductLineMember = typeof productLineMember.$inferInsert;
export type ActivityLog = typeof activityLog.$inferSelect;
export type NewActivityLog = typeof activityLog.$inferInsert;
export type AliasSupplier = typeof aliasSupplier.$inferSelect;
export type NewAliasSupplier = typeof aliasSupplier.$inferInsert;
export type AliasItem = typeof aliasItem.$inferSelect;
export type NewAliasItem = typeof aliasItem.$inferInsert;
