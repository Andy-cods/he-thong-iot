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

/**
 * V3.7.43 — Phân loại PO: COMMERCIAL (mua hàng có sẵn từ NCC) vs
 * SUBCONTRACT (gia công ngoài theo bản vẽ, dùng DDH-Mau template).
 */
export const purchaseOrderTypeEnum = pgEnum("purchase_order_type", [
  "COMMERCIAL",
  "SUBCONTRACT",
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

/** V1.2 — Purchase Request (header). V3.7.55 thêm fields theo form MRF GTAM. V3.7.69 thêm workflow 3 bước YCVT. */
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
    /** V3.7.55 MRF — "Kính gửi" (phòng/ban nhận đề xuất). */
    targetDepartment: varchar("target_department", { length: 64 }),
    /** V3.7.55 MRF — Bộ phận đề xuất. */
    proposingDepartment: varchar("proposing_department", { length: 64 }),
    /** V3.7.55 MRF — Lý do đề xuất. */
    requestReason: text("request_reason"),

    /** V3.7.69 YCVT — Số phiếu giấy format `{seq}/PRD-MRF/{MMYY}`. Auto-gen khi submit. */
    paperFormNo: varchar("paper_form_no", { length: 32 }),
    /** V3.7.69 YCVT — workflow 3-step: DRAFT/SUBMITTED/DEPT_APPROVED/DIRECTOR_APPROVED/CONVERTED/DONE/REJECTED. */
    approvalStep: varchar("approval_step", { length: 24 }).notNull().default("DRAFT"),

    /** V3.7.69 YCVT step 2: Trưởng bộ phận. */
    deptApprovedBy: uuid("dept_approved_by").references(() => userAccount.id),
    deptApprovedAt: timestamp("dept_approved_at", { withTimezone: true }),
    deptApprovalNote: text("dept_approval_note"),

    /** V3.7.69 YCVT step 3: Giám đốc / Mua hàng. */
    directorApprovedBy: uuid("director_approved_by").references(() => userAccount.id),
    directorApprovedAt: timestamp("director_approved_at", { withTimezone: true }),
    directorApprovalNote: text("director_approval_note"),

    /** V3.7.69 YCVT timeline IV. Theo dõi. */
    poCreatedAt: timestamp("po_created_at", { withTimezone: true }),
    goodsReceivedAt: timestamp("goods_received_at", { withTimezone: true }),
    goodsIssuedAt: timestamp("goods_issued_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    /** V3.7.69 YCVT — Reject path. */
    rejectedBy: uuid("rejected_by").references(() => userAccount.id),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),

    /** V3.7.69 YCVT — Tổng tiền dự kiến cache (sum line.line_total). Auto-calc bằng trigger. */
    totalEstimatedAmount: numeric("total_estimated_amount", {
      precision: 18,
      scale: 2,
    })
      .notNull()
      .default("0"),

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
    paperFormNoUk: uniqueIndex("pr_paper_form_no_uk").on(t.paperFormNo),
    approvalStepIdx: index("pr_approval_step_idx").on(t.approvalStep, t.createdAt),
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
    /** V3.7.43 — Phân loại PO. COMMERCIAL default, SUBCONTRACT cho gia công ngoài. */
    poType: purchaseOrderTypeEnum("po_type").notNull().default("COMMERCIAL"),
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
    typeIdx: index("purchase_order_type_idx").on(t.poType),
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
    /** V3.7.43 — Vật liệu/Quy cách (cho subcontract line). VD "SUS304 25x53x51mm". */
    spec: varchar("spec", { length: 255 }),
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

/** V1.2 — Purchase Request Line. V3.7.55 thêm fields theo form MRF GTAM. */
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
    /** V3.7.55 MRF — Quy cách chi tiết (VD "D6x50xL100"). */
    specification: varchar("specification", { length: 512 }),
    /** V3.7.55 MRF — ĐVT override theo line (mặc định kế thừa từ item.uom). */
    uom: varchar("uom", { length: 16 }),
    /** V3.7.55 MRF — Ưu tiên: URGENT (Khẩn) / NORMAL (Bình thường) / RESERVE (Dự phòng). */
    priority: varchar("priority", { length: 16 }).default("NORMAL"),
    /** V3.7.55 MRF — Phân loại: TOOL (CCDC) / CONSUMABLE (Tiêu hao) / MATERIAL / OTHER. */
    category: varchar("category", { length: 32 }),
    /** V3.7.55 MRF — Đơn giá dự kiến (VND). Tổng tiền = qty × unit_price. */
    estimatedUnitPrice: numeric("estimated_unit_price", {
      precision: 18,
      scale: 2,
    }),
    /** V3.7.55 MRF — Mã tham chiếu (link/PO cũ/sản phẩm NCC). */
    referenceCode: varchar("reference_code", { length: 128 }),
    /** V3.7.55 MRF — SL được duyệt sau review (≤ qty). NULL = chưa duyệt. */
    approvedQty: numeric("approved_qty", { precision: 18, scale: 6 }),
    /** V3.7.69 YCVT — Tồn kho snapshot lúc tạo phiếu (auto-fill từ inventory_balance). */
    onHandSnapshot: numeric("on_hand_snapshot", { precision: 18, scale: 4 }),
    /** V3.7.69 YCVT — Tổng tiền dòng = qty × estimated_unit_price (trigger auto-calc). */
    lineTotal: numeric("line_total", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
  },
  (t) => ({
    prIdx: index("pr_line_pr_idx").on(t.prId),
    itemIdx: index("pr_line_item_idx").on(t.itemId),
    supplierIdx: index("pr_line_supplier_idx").on(t.preferredSupplierId),
    snapshotIdx: index("pr_line_snapshot_idx").on(t.snapshotLineId),
    priorityIdx: index("pr_line_priority_idx").on(t.priority),
    categoryIdx: index("pr_line_category_idx").on(t.category),
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
