import { sql } from "drizzle-orm";
import {
  index,
  numeric,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { item, locationBin } from "./master";
import { inventoryLotSerial } from "./inventory";
import { inboundReceipt } from "./procurement";

/**
 * V3.6 — Warehouse putaway log.
 *
 * Track lot được đặt vào bin nào — phục vụ truy xuất nguồn gốc + lịch sử
 * nhập kho theo vị trí. inventory_txn ledger là source-of-truth cho qty;
 * putaway log là metadata bổ sung "ai đã đặt vào bin nào, khi nào".
 */
export const warehousePutaway = appSchema.table(
  "warehouse_putaway",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotSerialId: uuid("lot_serial_id")
      .notNull()
      .references(() => inventoryLotSerial.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id),
    binId: uuid("bin_id")
      .notNull()
      .references(() => locationBin.id),
    qty: numeric("qty", { precision: 18, scale: 4 }).notNull(),
    putawayAt: timestamp("putaway_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    putawayBy: uuid("putaway_by").references(() => userAccount.id),
    receiptId: uuid("receipt_id").references(() => inboundReceipt.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    lotIdx: index("putaway_lot_idx").on(t.lotSerialId),
    binIdx: index("putaway_bin_idx").on(t.binId),
    itemIdx: index("putaway_item_idx").on(t.itemId, t.putawayAt),
  }),
);

export type WarehousePutaway = typeof warehousePutaway.$inferSelect;
export type NewWarehousePutaway = typeof warehousePutaway.$inferInsert;
