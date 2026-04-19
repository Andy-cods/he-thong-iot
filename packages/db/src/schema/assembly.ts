import { sql } from "drizzle-orm";
import {
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
import { inventoryLotSerial } from "./inventory";
import { item, locationBin } from "./master";
import { salesOrder, orderBomSnapshot } from "./order";
import { workOrder } from "./production";
import { reservation } from "./reservation";

export const assemblyOrderStatusEnum = pgEnum("assembly_order_status", [
  "DRAFT",
  "PICKING",
  "ASSEMBLING",
  "COMPLETED",
  "CANCELLED",
]);

export const assemblyScanKindEnum = pgEnum("assembly_scan_kind", [
  "PICK",
  "CONSUME",
  "FG_OUTPUT",
]);

/** Bảng 18a: assembly_order */
export const assemblyOrder = appSchema.table(
  "assembly_order",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    aoNo: varchar("ao_no", { length: 64 }).notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => salesOrder.id),
    productItemId: uuid("product_item_id")
      .notNull()
      .references(() => item.id),
    plannedQty: numeric("planned_qty", { precision: 18, scale: 4 }).notNull(),
    completedQty: numeric("completed_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    status: assemblyOrderStatusEnum("status").notNull().default("DRAFT"),
    woId: uuid("wo_id").references(() => workOrder.id),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    aoNoIdx: uniqueIndex("assembly_order_no_uk").on(t.aoNo),
    orderIdx: index("assembly_order_order_idx").on(t.orderId),
    statusIdx: index("assembly_order_status_idx").on(t.status),
  }),
);

/** Bảng 18b: assembly_scan — idempotent qua offline_queue_id */
export const assemblyScan = appSchema.table(
  "assembly_scan",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    aoId: uuid("ao_id")
      .notNull()
      .references(() => assemblyOrder.id, { onDelete: "cascade" }),
    snapshotLineId: uuid("snapshot_line_id").references(
      () => orderBomSnapshot.id,
    ),
    offlineQueueId: varchar("offline_queue_id", { length: 128 }).notNull(),
    scanKind: assemblyScanKindEnum("scan_kind").notNull(),
    barcode: varchar("barcode", { length: 128 }).notNull(),
    itemId: uuid("item_id").references(() => item.id),
    qty: numeric("qty", { precision: 18, scale: 4 }).notNull().default("1"),
    fromBinId: uuid("from_bin_id").references(() => locationBin.id),
    woId: uuid("wo_id").references(() => workOrder.id),
    lotSerialId: uuid("lot_serial_id").references(() => inventoryLotSerial.id),
    reservationId: uuid("reservation_id").references(() => reservation.id),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull(),
    scannedBy: uuid("scanned_by").references(() => userAccount.id),
    deviceId: varchar("device_id", { length: 64 }),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    offlineUk: uniqueIndex("assembly_scan_offline_uk").on(t.offlineQueueId),
    aoIdx: index("assembly_scan_ao_idx").on(t.aoId, t.scannedAt),
    snapIdx: index("assembly_scan_snapshot_idx").on(t.snapshotLineId),
  }),
);

/** Bảng 18c: fg_serial — serial của thành phẩm */
export const fgSerial = appSchema.table(
  "fg_serial",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    aoId: uuid("ao_id")
      .notNull()
      .references(() => assemblyOrder.id, { onDelete: "cascade" }),
    productItemId: uuid("product_item_id")
      .notNull()
      .references(() => item.id),
    serialCode: varchar("serial_code", { length: 128 }).notNull(),
    producedAt: timestamp("produced_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    producedBy: uuid("produced_by").references(() => userAccount.id),
    notes: text("notes"),
  },
  (t) => ({
    serialUk: uniqueIndex("fg_serial_uk").on(t.productItemId, t.serialCode),
    aoIdx: index("fg_serial_ao_idx").on(t.aoId),
  }),
);

export type AssemblyOrder = typeof assemblyOrder.$inferSelect;
export type AssemblyScan = typeof assemblyScan.$inferSelect;
export type FgSerial = typeof fgSerial.$inferSelect;
