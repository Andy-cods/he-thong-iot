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
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";

/**
 * V3.8 — Bảng điều hành sản xuất (Production Board).
 *
 * Mục tiêu: màn hình kiểu "bảng chờ chuyến bay" chiếu lên TV xưởng, hiển thị
 * các mã hàng đang/sắp gia công + vài mã vừa hoàn thành. Tổ QC nhập tay số
 * liệu (mã hàng, SL, trạng thái sản xuất). Tham khảo file "Danh sách thống
 * kê.xlsx" của xưởng (cột BQMS code / RFQ / Spec / Khách hàng / SL / deadline).
 *
 * Trạng thái map theo luồng work_order + cột giao hàng Excel:
 *   QUEUED (Sắp GC) → IN_PROGRESS (Đang GC) → QC (Đang kiểm) →
 *   COMPLETED (Hoàn thành) → DELIVERED (Đã giao, mờ dần khỏi board).
 */
export const productionBoardStatusEnum = pgEnum("production_board_status", [
  "QUEUED",
  "IN_PROGRESS",
  "QC",
  "COMPLETED",
  "DELIVERED",
]);

export const productionBoardItem = appSchema.table(
  "production_board_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** STT hiển thị / thứ tự ưu tiên trên board (nhỏ = lên đầu). */
    seq: integer("seq").notNull().default(0),
    /** Mã hàng — BQMS code (vd Z0000002-259491). */
    productCode: varchar("product_code", { length: 128 }).notNull(),
    /** Mã RFQ/báo giá (vd QT25052426). */
    rfqNo: varchar("rfq_no", { length: 64 }),
    /** Tên/Spec sản phẩm (free text, có thể nhiều dòng). */
    productName: text("product_name").notNull(),
    /** Khách hàng (SEVT / SEV …). */
    customer: varchar("customer", { length: 64 }),
    /** SL kế hoạch (đặt hàng). */
    qtyPlanned: numeric("qty_planned", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    /** SL đã làm/đạt (QC pass). */
    qtyDone: numeric("qty_done", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    uom: varchar("uom", { length: 24 }).default("Pcs"),
    status: productionBoardStatusEnum("status").notNull().default("QUEUED"),
    /** Hạn giao (deadline). */
    deadline: date("deadline"),
    /** Công đoạn hiện tại (free text, vd "CNC 02", "Đánh bóng"). */
    currentStage: varchar("current_stage", { length: 128 }),
    notes: text("notes"),
    /** Ghim lên đầu board (mã ưu tiên / khẩn). */
    isPinned: boolean("is_pinned").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedBy: uuid("updated_by").references(() => userAccount.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    statusIdx: index("production_board_status_idx").on(t.status),
    seqIdx: index("production_board_seq_idx").on(t.seq),
    codeIdx: index("production_board_code_idx").on(t.productCode),
  }),
);

/** Lịch sử thay đổi (audit) — mỗi lần đổi status/qty ghi 1 dòng. */
export const productionBoardHistory = appSchema.table(
  "production_board_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => productionBoardItem.id, { onDelete: "cascade" }),
    /** Field đã đổi: 'status' | 'qty_done' | 'create' | 'delete' | … */
    field: varchar("field", { length: 32 }).notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    changedBy: uuid("changed_by").references(() => userAccount.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    itemIdx: index("production_board_history_item_idx").on(
      t.itemId,
      t.changedAt,
    ),
  }),
);

export type ProductionBoardItem = typeof productionBoardItem.$inferSelect;
export type NewProductionBoardItem = typeof productionBoardItem.$inferInsert;
export type ProductionBoardHistory = typeof productionBoardHistory.$inferSelect;
export type ProductionBoardStatus =
  (typeof productionBoardStatusEnum.enumValues)[number];
