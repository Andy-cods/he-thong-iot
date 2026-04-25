import { sql } from "drizzle-orm";
import {
  boolean,
  date,
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

/**
 * V1.2 Purchase Request status enum.
 * DRAFT → SUBMITTED → APPROVED → CONVERTED (to PO)
 * DRAFT/SUBMITTED → REJECTED.
 */
export const purchaseRequestStatusEnum = pgEnum("purchase_request_status", [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "CONVERTED",
  "REJECTED",
]);

/** V1.2 — Purchase Request (header) */
export const purchaseRequest = appSchema.table(
  "purchase_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    title: varchar("title", { length: 255 }),
    status: purchaseRequestStatusEnum("status").notNull().default("DRAFT"),
    source: varchar("source", { length: 16 }).notNull().default("MANUAL"),
    linkedOrderId: uuid("linked_order_id").references(() => salesOrder.id),
    requestedBy: uuid("requested_by").references(() => userAccount.id),
    approvedBy: uuid("approved_by").references(() => userAccount.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    codeUk: uniqueIndex("purchase_request_code_uk").on(t.code),
    statusIdx: index("pr_status_idx").on(t.status),
    orderIdx: index("pr_linked_order_idx").on(t.linkedOrderId),
    requestedIdx: index("pr_requested_by_idx").on(t.requestedBy),
  }),
);

/** Bảng 13a: purchase_order (V1.2 thêm pr_id) */
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
    /** V1.2: link PO tới PR nguồn (nullable — support PO tạo manual không qua PR) */
    prId: uuid("pr_id").references(() => purchaseRequest.id),
    orderDate: date("order_date").notNull().default(sql`CURRENT_DATE`),
    expectedEta: date("expected_eta"),
    currency: varchar("currency", { length: 8 }).notNull().default("VND"),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /**
     * V1.9-P9: payment terms auto-fill từ supplier.paymentTerms khi tạo
     * nhưng editable riêng trên PO.
     */
    paymentTerms: varchar("payment_terms", { length: 100 }),
    /** V1.9-P9: địa chỉ giao hàng cho PO này (default "Xưởng Song Châu"). */
    deliveryAddress: text("delivery_address"),
    /** V1.9-P9: ngày thực tế nhận đủ (dùng cho báo cáo on-time rate). */
    actualDeliveryDate: date("actual_delivery_date"),
    /**
     * V1.9-P9: metadata jsonb — chứa approvalStatus (pending/approved/rejected),
     * approvedBy, approvedAt, rejectedReason, submittedBy, submittedAt.
     * KISS: không alter enum purchase_order_status → dùng metadata layer.
     */
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    poNoIdx: uniqueIndex("purchase_order_no_uk").on(t.poNo),
    statusIdx: index("purchase_order_status_idx").on(t.status),
    supplierIdx: index("purchase_order_supplier_idx").on(t.supplierId),
    prIdx: index("po_pr_idx").on(t.prId),
  }),
);

/** Bảng 13b: purchase_order_line (V1.2 thêm snapshot_line_id trace shortage) */
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
    /** V1.9-P9: VAT % per line (default 8 %). */
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("8"),
    /** V1.9-P9: cache qty*price*(1+tax) — tính khi insert/update. */
    lineTotal: numeric("line_total", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    expectedEta: date("expected_eta"),
    /**
     * V1.2: link tới bom_snapshot_line để tracing nguồn shortage.
     * FK đặt bằng `uuid` thuần + migration tạo FK (để tránh circular import TS
     * từ snapshot.ts → procurement.ts trong runtime).
     */
    snapshotLineId: uuid("snapshot_line_id"),
    notes: text("notes"),
  },
  (t) => ({
    poIdx: index("po_line_po_idx").on(t.poId),
    itemIdx: index("po_line_item_idx").on(t.itemId),
    snapshotIdx: index("po_line_snapshot_idx").on(t.snapshotLineId),
    uniq: uniqueIndex("po_line_uk").on(t.poId, t.lineNo),
  }),
);

/** V1.2 — Purchase Request Line */
export const purchaseRequestLine = appSchema.table(
  "purchase_request_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    prId: uuid("pr_id")
      .notNull()
      .references(() => purchaseRequest.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id),
    qty: numeric("qty", { precision: 18, scale: 6 }).notNull(),
    preferredSupplierId: uuid("preferred_supplier_id").references(
      () => supplier.id,
    ),
    /** Link ngược về snapshot_line nguồn (khi source = SHORTAGE). FK migration. */
    snapshotLineId: uuid("snapshot_line_id"),
    neededBy: date("needed_by"),
    notes: text("notes"),
  },
  (t) => ({
    prIdx: index("pr_line_pr_idx").on(t.prId),
    itemIdx: index("pr_line_item_idx").on(t.itemId),
    supplierIdx: index("pr_line_supplier_idx").on(t.preferredSupplierId),
    snapshotIdx: index("pr_line_snapshot_idx").on(t.snapshotLineId),
    uniq: uniqueIndex("pr_line_uk").on(t.prId, t.lineNo),
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
export type NewPurchaseOrder = typeof purchaseOrder.$inferInsert;
export type PurchaseOrderLine = typeof purchaseOrderLine.$inferSelect;
export type NewPurchaseOrderLine = typeof purchaseOrderLine.$inferInsert;
export type PurchaseRequest = typeof purchaseRequest.$inferSelect;
export type NewPurchaseRequest = typeof purchaseRequest.$inferInsert;
export type PurchaseRequestLine = typeof purchaseRequestLine.$inferSelect;
export type NewPurchaseRequestLine = typeof purchaseRequestLine.$inferInsert;
export type PurchaseRequestStatus =
  (typeof purchaseRequestStatusEnum.enumValues)[number];
export type InboundReceipt = typeof inboundReceipt.$inferSelect;
export type InboundReceiptLine = typeof inboundReceiptLine.$inferSelect;
