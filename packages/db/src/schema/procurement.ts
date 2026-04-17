import { sql } from "drizzle-orm";
import {
  boolean,
  date,
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
import { item, supplier, locationBin } from "./master";
import { salesOrder } from "./order";

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "DRAFT",
  "SENT",
  "PARTIAL",
  "RECEIVED",
  "CANCELLED",
  "CLOSED",
]);

export const qcFlagEnum = pgEnum("qc_flag", ["PENDING", "PASS", "FAIL"]);

/** Bảng 13a: purchase_order */
export const purchaseOrder = appSchema.table(
  "purchase_order",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    poNo: varchar("po_no", { length: 64 }).notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id),
    status: purchaseOrderStatusEnum("status").notNull().default("DRAFT"),
    linkedOrderId: uuid("linked_order_id").references(() => salesOrder.id),
    orderDate: date("order_date").notNull().default(sql`CURRENT_DATE`),
    expectedEta: date("expected_eta"),
    currency: varchar("currency", { length: 8 }).notNull().default("VND"),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    poNoIdx: uniqueIndex("purchase_order_no_uk").on(t.poNo),
    statusIdx: index("purchase_order_status_idx").on(t.status),
    supplierIdx: index("purchase_order_supplier_idx").on(t.supplierId),
  }),
);

/** Bảng 13b: purchase_order_line */
export const purchaseOrderLine = appSchema.table(
  "purchase_order_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id),
    orderedQty: numeric("ordered_qty", { precision: 18, scale: 4 }).notNull(),
    receivedQty: numeric("received_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    unitPrice: numeric("unit_price", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    expectedEta: date("expected_eta"),
    notes: text("notes"),
  },
  (t) => ({
    poIdx: index("po_line_po_idx").on(t.poId),
    itemIdx: index("po_line_item_idx").on(t.itemId),
    uniq: uniqueIndex("po_line_uk").on(t.poId, t.lineNo),
  }),
);

/** Bảng 14a: inbound_receipt */
export const inboundReceipt = appSchema.table(
  "inbound_receipt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptNo: varchar("receipt_no", { length: 64 }).notNull(),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrder.id),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    receivedBy: uuid("received_by").references(() => userAccount.id),
    qcFlag: qcFlagEnum("qc_flag").notNull().default("PENDING"),
    qcCheckedAt: timestamp("qc_checked_at", { withTimezone: true }),
    qcCheckedBy: uuid("qc_checked_by").references(() => userAccount.id),
    qcNotes: text("qc_notes"),
    isPosted: boolean("is_posted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    receiptNoIdx: uniqueIndex("inbound_receipt_no_uk").on(t.receiptNo),
    poIdx: index("inbound_receipt_po_idx").on(t.poId),
    qcIdx: index("inbound_receipt_qc_idx").on(t.qcFlag),
  }),
);

/** Bảng 14b: inbound_receipt_line */
export const inboundReceiptLine = appSchema.table(
  "inbound_receipt_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => inboundReceipt.id, { onDelete: "cascade" }),
    poLineId: uuid("po_line_id")
      .notNull()
      .references(() => purchaseOrderLine.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id),
    receivedQty: numeric("received_qty", { precision: 18, scale: 4 })
      .notNull(),
    locationBinId: uuid("location_bin_id").references(() => locationBin.id),
    lotCode: varchar("lot_code", { length: 64 }),
    serialCode: varchar("serial_code", { length: 128 }),
    notes: text("notes"),
  },
  (t) => ({
    receiptIdx: index("inbound_receipt_line_receipt_idx").on(t.receiptId),
    itemIdx: index("inbound_receipt_line_item_idx").on(t.itemId),
  }),
);

export type PurchaseOrder = typeof purchaseOrder.$inferSelect;
export type PurchaseOrderLine = typeof purchaseOrderLine.$inferSelect;
export type InboundReceipt = typeof inboundReceipt.$inferSelect;
export type InboundReceiptLine = typeof inboundReceiptLine.$inferSelect;
