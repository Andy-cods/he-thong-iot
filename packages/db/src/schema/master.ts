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

export const itemTypeEnum = pgEnum("item_type", [
  "RAW",
  "PURCHASED",
  "FABRICATED",
  "SUB_ASSEMBLY",
  "FG",
  "CONSUMABLE",
  "TOOL",
  "PACKAGING",
]);

export const barcodeTypeEnum = pgEnum("barcode_type", [
  "EAN13",
  "EAN8",
  "CODE128",
  "CODE39",
  "QR",
  "DATAMATRIX",
]);

export const barcodeSourceEnum = pgEnum("barcode_source", [
  "vendor",
  "internal",
]);

export const uomEnum = pgEnum("uom", [
  "PCS",
  "SET",
  "KG",
  "G",
  "M",
  "MM",
  "CM",
  "L",
  "ML",
  "HOUR",
  "PAIR",
  "BOX",
  "ROLL",
  "SHEET",
]);

export const itemStatusEnum = pgEnum("item_status", [
  "ACTIVE",
  "OBSOLETE",
  "DRAFT",
]);

/** Bảng 4: item (master vật tư) */
export const item = appSchema.table(
  "item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sku: varchar("sku", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    itemType: itemTypeEnum("item_type").notNull(),
    uom: uomEnum("uom").notNull(),
    status: itemStatusEnum("status").notNull().default("ACTIVE"),
    category: varchar("category", { length: 64 }),
    isActive: boolean("is_active").notNull().default(true),
    description: text("description"),
    specJson: text("spec_json"),
    imageUrl: text("image_url"),
    defaultLocationId: uuid("default_location_id"),
    minStockQty: numeric("min_stock_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    reorderQty: numeric("reorder_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    leadTimeDays: integer("lead_time_days").notNull().default(0),
    isLotTracked: boolean("is_lot_tracked").notNull().default(false),
    isSerialTracked: boolean("is_serial_tracked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedBy: uuid("updated_by").references(() => userAccount.id),
  },
  (t) => ({
    skuIdx: uniqueIndex("item_sku_uk").on(t.sku),
    typeIdx: index("item_type_idx").on(t.itemType),
    statusIdx: index("item_status_idx").on(t.status),
    nameSearchIdx: index("item_name_trgm_idx").on(t.name),
  }),
);

/** Bảng 5: item_barcode */
export const itemBarcode = appSchema.table(
  "item_barcode",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    barcode: varchar("barcode", { length: 128 }).notNull(),
    barcodeType: barcodeTypeEnum("barcode_type").notNull().default("CODE128"),
    source: barcodeSourceEnum("source").notNull().default("internal"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    barcodeIdx: uniqueIndex("item_barcode_value_uk").on(t.barcode),
    itemIdx: index("item_barcode_item_idx").on(t.itemId),
  }),
);

/** Bảng 6: supplier + item_supplier (gộp supplier vào đây để đủ FK) */
export const supplier = appSchema.table(
  "supplier",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    contactName: varchar("contact_name", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    address: text("address"),
    taxCode: varchar("tax_code", { length: 32 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    codeIdx: uniqueIndex("supplier_code_uk").on(t.code),
  }),
);

export const itemSupplier = appSchema.table(
  "item_supplier",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "cascade" }),
    supplierSku: varchar("supplier_sku", { length: 128 }),
    vendorItemCode: varchar("vendor_item_code", { length: 128 }),
    priceRef: numeric("price_ref", { precision: 18, scale: 4 }),
    currency: varchar("currency", { length: 8 }).notNull().default("VND"),
    leadTimeDays: integer("lead_time_days").notNull().default(7),
    moq: numeric("moq", { precision: 18, scale: 4 }).notNull().default("1"),
    packSize: numeric("pack_size", { precision: 18, scale: 4 })
      .notNull()
      .default("1"),
    isPreferred: boolean("is_preferred").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    uniq: uniqueIndex("item_supplier_uk").on(t.itemId, t.supplierId),
    supplierIdx: index("item_supplier_supplier_idx").on(t.supplierId),
  }),
);

/** Bảng 7: location_bin (1 warehouse V1, gộp luôn warehouse vào cột) */
export const locationBin = appSchema.table(
  "location_bin",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    warehouseCode: varchar("warehouse_code", { length: 32 })
      .notNull()
      .default("WH-01"),
    zone: varchar("zone", { length: 32 }).notNull(),
    binCode: varchar("bin_code", { length: 64 }).notNull(),
    description: text("description"),
    isWip: boolean("is_wip").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    uniq: uniqueIndex("location_bin_uk").on(
      t.warehouseCode,
      t.zone,
      t.binCode,
    ),
  }),
);

export type Item = typeof item.$inferSelect;
export type NewItem = typeof item.$inferInsert;
export type ItemBarcode = typeof itemBarcode.$inferSelect;
export type NewItemBarcode = typeof itemBarcode.$inferInsert;
export type Supplier = typeof supplier.$inferSelect;
export type NewSupplier = typeof supplier.$inferInsert;
export type ItemSupplier = typeof itemSupplier.$inferSelect;
export type NewItemSupplier = typeof itemSupplier.$inferInsert;
export type LocationBin = typeof locationBin.$inferSelect;
