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
import { item, locationBin } from "./master";

/**
 * V1.2 — Lot status: QC HOLD + CONSUMED + EXPIRED.
 * Default AVAILABLE (lot mới nhận vào kho).
 */
export const lotStatusEnum = pgEnum("lot_status", [
  "AVAILABLE",
  "HOLD",
  "CONSUMED",
  "EXPIRED",
]);

export const invTxTypeEnum = pgEnum("inv_tx_type", [
  "IN_RECEIPT",
  "OUT_ISSUE",
  "TRANSFER",
  "ADJUST_PLUS",
  "ADJUST_MINUS",
  "RESERVE",
  "UNRESERVE",
  "PROD_IN",
  "PROD_OUT",
  "ASSEMBLY_CONSUME",
]);

/** Bảng 17: inventory_lot_serial */
export const inventoryLotSerial = appSchema.table(
  "inventory_lot_serial",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id),
    lotCode: varchar("lot_code", { length: 64 }),
    serialCode: varchar("serial_code", { length: 128 }),
    mfgDate: date("mfg_date"),
    expDate: date("exp_date"),
    supplierRef: varchar("supplier_ref", { length: 128 }),
    /** V1.2 — lot status: AVAILABLE (default) / HOLD (QC fail) / CONSUMED / EXPIRED */
    status: lotStatusEnum("status").notNull().default("AVAILABLE"),
    holdReason: text("hold_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    itemIdx: index("inventory_lot_serial_item_idx").on(t.itemId),
    statusIdx: index("lot_serial_status_idx").on(t.status),
    lotIdx: uniqueIndex("inventory_lot_uk")
      .on(t.itemId, t.lotCode)
      .where(sql`${t.lotCode} IS NOT NULL AND ${t.serialCode} IS NULL`),
    serialIdx: uniqueIndex("inventory_serial_uk")
      .on(t.itemId, t.serialCode)
      .where(sql`${t.serialCode} IS NOT NULL`),
  }),
);

/** Bảng 16: inventory_txn — transaction-first, không partition V1 */
export const inventoryTxn = appSchema.table(
  "inventory_txn",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    txType: invTxTypeEnum("tx_type").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id),
    qty: numeric("qty", { precision: 18, scale: 4 }).notNull(),
    fromBinId: uuid("from_bin_id").references(() => locationBin.id),
    toBinId: uuid("to_bin_id").references(() => locationBin.id),
    lotSerialId: uuid("lot_serial_id").references(() => inventoryLotSerial.id),
    refTable: varchar("ref_table", { length: 64 }),
    refId: uuid("ref_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    postedBy: uuid("posted_by").references(() => userAccount.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    itemIdx: index("inventory_txn_item_idx").on(t.itemId, t.occurredAt),
    typeIdx: index("inventory_txn_type_idx").on(t.txType),
    refIdx: index("inventory_txn_ref_idx").on(t.refTable, t.refId),
    occurredIdx: index("inventory_txn_occurred_idx").on(t.occurredAt),
  }),
);

export type InventoryTxn = typeof inventoryTxn.$inferSelect;
export type NewInventoryTxn = typeof inventoryTxn.$inferInsert;
export type InventoryLotSerial = typeof inventoryLotSerial.$inferSelect;
