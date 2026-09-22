import { sql } from "drizzle-orm";
import {
  index,
  integer,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { item } from "./master";
import { salesOrder } from "./order";
import { purchaseOrder } from "./procurement";
import { warehouseIssueRequest } from "./warehouse-location";

/**
 * V4.0 Wave 3 Phase D — Phiếu giao hàng / Biên bản giao hàng (BBGH).
 *
 * Thiết kế đầy đủ: `plans/v4-finance/bbgh-form-design.md` (đã duyệt theo U-4 —
 * Claude tự thiết kế, user sửa sau). Quan hệ 1–1 với `warehouse_issue_request`
 * (1 issue request COMPLETED → tối đa 1 delivery note). Chỉ áp dụng cho xuất
 * hàng RA NGOÀI công ty (`reason IN ('sales','return')`) — xuất nội bộ SX
 * không cần BBGH.
 *
 * Trạng thái đơn giản (varchar tự do, giống purchase_request.approval_step —
 * KHÔNG dùng pgEnum để dễ mở rộng, tránh ALTER TYPE):
 *   DRAFT → PENDING_APPROVAL → CONFIRMED (= BBGH chính thức) | REJECTED
 *
 * "Phiếu giao hàng" (DRAFT/PENDING_APPROVAL, chưa ký) và "BBGH" (CONFIRMED, đã
 * Giám đốc duyệt) là CÙNG 1 bảng, khác trạng thái — không tách 2 bảng.
 */
export const deliveryNote = appSchema.table(
  "delivery_note",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Số BBGH — sinh tự động `BBGH-{yymm}-{seq4}` lúc tạo (genDocNo). */
    noteNo: varchar("note_no", { length: 32 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("DRAFT"),

    /** Nguồn — 1 issue request COMPLETED sinh tối đa 1 delivery note. */
    issueRequestId: uuid("issue_request_id")
      .notNull()
      .references(() => warehouseIssueRequest.id),
    /** Tham chiếu nếu là xuất bán (reason=sales). Nullable. */
    salesOrderId: uuid("sales_order_id").references(() => salesOrder.id),
    /** Tham chiếu nếu là trả hàng NCC (reason=return). Nullable. */
    poId: uuid("po_id").references(() => purchaseOrder.id),

    /**
     * Bên nhận — lưu snapshot text (hệ thống chưa có bảng `customer` riêng,
     * xác nhận qua audit schema — sales_order.customerName cũng là free-text).
     */
    recipientName: varchar("recipient_name", { length: 255 }).notNull(),
    recipientAddress: text("recipient_address"),
    recipientContactName: varchar("recipient_contact_name", { length: 128 }),
    recipientPhone: varchar("recipient_phone", { length: 32 }),

    /** Số hợp đồng liên quan — free-text (chưa có bảng contract riêng). */
    contractNo: varchar("contract_no", { length: 64 }),

    /** Vận chuyển. */
    vehicleType: varchar("vehicle_type", { length: 64 }),
    vehiclePlate: varchar("vehicle_plate", { length: 32 }),
    carrierName: varchar("carrier_name", { length: 128 }),
    carrierPhone: varchar("carrier_phone", { length: 32 }),

    /** Kết luận giao nhận — FULL (đủ) | SHORT (thiếu) | DAMAGED (hư hỏng). */
    deliveryResult: varchar("delivery_result", { length: 16 })
      .notNull()
      .default("FULL"),
    conclusionNotes: text("conclusion_notes"),

    /** Người lập / giao hàng (mặc định actor thao tác tạo phiếu). */
    deliveredBy: uuid("delivered_by")
      .notNull()
      .references(() => userAccount.id),

    /** Giám đốc (admin) duyệt — CHỈ admin, xem RBAC entity `deliveryNote`. */
    confirmedBy: uuid("confirmed_by").references(() => userAccount.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    rejectedBy: uuid("rejected_by").references(() => userAccount.id),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    noteNoUk: uniqueIndex("delivery_note_no_uk").on(t.noteNo),
    issueRequestUk: uniqueIndex("delivery_note_issue_request_uk").on(
      t.issueRequestId,
    ),
    statusIdx: index("delivery_note_status_idx").on(t.status, t.createdAt),
  }),
);

export const deliveryNoteLine = appSchema.table(
  "delivery_note_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deliveryNoteId: uuid("delivery_note_id")
      .notNull()
      .references(() => deliveryNote.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id),
    specification: varchar("specification", { length: 256 }),
    uom: varchar("uom", { length: 32 }),
    /** SL theo chứng từ (issue request picks). */
    docQty: numeric("doc_qty", { precision: 18, scale: 4 }).notNull(),
    /** SL thực giao — mặc định = docQty, override nếu giao thiếu. */
    actualQty: numeric("actual_qty", { precision: 18, scale: 4 }).notNull(),
    condition: varchar("condition", { length: 16 }).notNull().default("FULL"),
    notes: text("notes"),
  },
  (t) => ({
    noteIdx: index("delivery_note_line_note_idx").on(t.deliveryNoteId),
    itemIdx: index("delivery_note_line_item_idx").on(t.itemId),
    uniq: uniqueIndex("delivery_note_line_uk").on(t.deliveryNoteId, t.lineNo),
  }),
);

export type DeliveryNote = typeof deliveryNote.$inferSelect;
export type NewDeliveryNote = typeof deliveryNote.$inferInsert;
export type DeliveryNoteLine = typeof deliveryNoteLine.$inferSelect;
export type NewDeliveryNoteLine = typeof deliveryNoteLine.$inferInsert;
