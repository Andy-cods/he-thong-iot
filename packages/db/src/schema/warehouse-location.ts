import { sql } from "drizzle-orm";
import {
  index,
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

/**
 * V3.7.9 — Yêu cầu xuất kho cần Kho duyệt.
 *
 * Workflow: bộ phận khác (operator/planner) tạo PENDING với picksJson plan
 * → Kho APPROVED (tự động execute OUT_ISSUE inventory_txn) hoặc REJECTED.
 */
export const warehouseIssueRequest = appSchema.table(
  "warehouse_issue_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestNo: varchar("request_no", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("PENDING"),
    reason: varchar("reason", { length: 32 }).notNull().default("manual"),
    reference: varchar("reference", { length: 64 }),
    notes: text("notes"),
    /** Plan picks: [{ itemId, sku, picks: [{lotSerialId, lotCode, binId, binCode, qty}] }] */
    picksJson: jsonb("picks_json").notNull().default(sql`'[]'::jsonb`),
    totalQty: numeric("total_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => userAccount.id),
    approvedBy: uuid("approved_by").references(() => userAccount.id),
    rejectedBy: uuid("rejected_by").references(() => userAccount.id),
    rejectReason: text("reject_reason"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    requestNoUk: uniqueIndex("issue_request_no_uk").on(t.requestNo),
    statusIdx: index("issue_request_status_idx").on(t.status, t.createdAt),
    requesterIdx: index("issue_request_requester_idx").on(
      t.requestedBy,
      t.createdAt,
    ),
  }),
);

export type WarehouseIssueRequest =
  typeof warehouseIssueRequest.$inferSelect;
export type NewWarehouseIssueRequest =
  typeof warehouseIssueRequest.$inferInsert;
