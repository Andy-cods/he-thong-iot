import { sql } from "drizzle-orm";
import {
  foreignKey,
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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { item } from "./master";

/**
 * V1.1-alpha BOM schema (rewrite):
 *  - Bỏ bảng `bom_revision` (flat V1) — defer về V1.1-full.
 *  - `bom_line` self-referencing tree (parent_line_id) thay vì parent/child flat.
 *  - `bom_template` thêm parentItemId + targetQty + status enum.
 */

export const bomStatusEnum = pgEnum("bom_status", [
  "DRAFT",
  "ACTIVE",
  "OBSOLETE",
]);

/** Bảng 8: bom_template — header BOM (1 template = 1 BOM) */
export const bomTemplate = appSchema.table(
  "bom_template",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    parentItemId: uuid("parent_item_id").references(() => item.id, {
      onDelete: "set null",
    }),
    targetQty: numeric("target_qty", { precision: 18, scale: 6 })
      .notNull()
      .default("1"),
    status: bomStatusEnum("status").notNull().default("DRAFT"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    codeIdx: uniqueIndex("bom_template_code_uk").on(t.code),
    statusIdx: index("bom_template_status_idx").on(t.status),
    parentItemIdx: index("bom_template_parent_item_idx").on(t.parentItemId),
    updatedIdx: index("bom_template_updated_idx").on(t.updatedAt),
  }),
);

/**
 * Bảng 9: bom_line — self-ref tree.
 * `parentLineId = null` → root (level=1). Level tối đa 5 (CHECK enforce DB + app-side).
 */
export const bomLine = appSchema.table(
  "bom_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => bomTemplate.id, { onDelete: "cascade" }),
    parentLineId: uuid("parent_line_id"),
    componentItemId: uuid("component_item_id")
      .notNull()
      .references(() => item.id),
    level: integer("level").notNull().default(1),
    position: integer("position").notNull().default(1),
    qtyPerParent: numeric("qty_per_parent", { precision: 18, scale: 6 })
      .notNull()
      .default("1"),
    scrapPercent: numeric("scrap_percent", { precision: 6, scale: 3 })
      .notNull()
      .default("0"),
    uom: varchar("uom", { length: 32 }),
    description: text("description"),
    supplierItemCode: varchar("supplier_item_code", { length: 128 }),
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
      columns: [t.parentLineId],
      foreignColumns: [t.id as AnyPgColumn],
      name: "bom_line_parent_fk",
    }).onDelete("cascade"),
    templateLevelIdx: index("bom_line_template_level_seq_idx").on(
      t.templateId,
      t.level,
      t.position,
    ),
    parentIdx: index("bom_line_parent_idx").on(t.parentLineId),
    componentIdx: index("bom_line_component_idx").on(t.componentItemId),
  }),
);

/**
 * Bảng 10: receiving_event — event kho nhận (stub V1.1-alpha).
 * UUIDv7 client-gen để idempotent giữa PWA offline → server.
 */
export const receivingEvent = appSchema.table(
  "receiving_event",
  {
    id: uuid("id").primaryKey(),
    scanId: uuid("scan_id").notNull(),
    poCode: varchar("po_code", { length: 64 }).notNull(),
    sku: varchar("sku", { length: 128 }).notNull(),
    qty: numeric("qty", { precision: 18, scale: 6 }).notNull(),
    lotNo: varchar("lot_no", { length: 128 }),
    qcStatus: varchar("qc_status", { length: 16 }).notNull().default("PENDING"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull(),
    receivedBy: uuid("received_by").references(() => userAccount.id),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    rawCode: varchar("raw_code", { length: 256 }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    scanIdUk: uniqueIndex("receiving_event_scan_id_uk").on(t.scanId),
    poIdx: index("receiving_event_po_idx").on(t.poCode, t.scannedAt),
    skuIdx: index("receiving_event_sku_idx").on(t.sku),
    userIdx: index("receiving_event_user_idx").on(t.receivedBy, t.scannedAt),
  }),
);

export type BomTemplate = typeof bomTemplate.$inferSelect;
export type NewBomTemplate = typeof bomTemplate.$inferInsert;
export type BomLine = typeof bomLine.$inferSelect;
export type NewBomLine = typeof bomLine.$inferInsert;
export type ReceivingEvent = typeof receivingEvent.$inferSelect;
export type NewReceivingEvent = typeof receivingEvent.$inferInsert;
