import { sql } from "drizzle-orm";
import {
  index,
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
import { inventoryLotSerial, inventoryTxn } from "./inventory";

/**
 * V4.3 Việc 2 — Kiểm kê kho (stocktake).
 *
 * Trạng thái varchar + CHECK (KHÔNG dùng pgEnum) — cùng lý do đã ghi ở
 * `delivery-note.ts`/`goods-issue.ts`: tránh `ALTER TYPE` khi cần mở rộng và
 * tránh lặp lại sự cố drift enum `app.*` vs `public.*` đã ghi ở
 * `packages/db/DRIFT-NOTES.md` mục 1. Migration `0068_stocktake.sql` tạo bảng
 * idempotent trong schema `app`.
 *
 * State machine:
 *   DRAFT (đang đếm) → PENDING_APPROVAL (Kho gửi duyệt)
 *     → APPROVED (Giám đốc/admin chốt — ghi ADJUST_PLUS/MINUS 1 lần)
 *     → REJECTED (Giám đốc trả lại kèm lý do) → quay lại DRAFT để đếm lại
 *   DRAFT → CANCELLED (huỷ phiên, không ghi điều chỉnh gì)
 *
 * Snapshot tồn sổ sách chụp NGAY khi tạo phiên (`stocktake_line.book_qty` =
 * `app.bin_inventory` tại thời điểm đó, `snapshot_at` = thời điểm chụp) — khi
 * duyệt chốt, so `book_qty` với `counted_qty` để ghi CHÊNH LỆCH, không phải
 * ghi đè tồn tuyệt đối (tránh đè mất giao dịch phát sinh giữa lúc đếm).
 */
export const stocktakeSession = appSchema.table(
  "stocktake_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Số phiếu — sinh tự động `KK-{yymm}-{seq4}` (genDocNo). */
    code: varchar("code", { length: 32 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("DRAFT"),
    /** Mô tả phạm vi kiểm (vd "Khu A - Kệ 01-05") — tự do, phục vụ hiển thị. */
    scopeNote: text("scope_note"),
    /** Thời điểm chụp tồn sổ sách — mặc định = lúc tạo phiên. */
    snapshotAt: timestamp("snapshot_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    notes: text("notes"),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),

    submittedBy: uuid("submitted_by").references(() => userAccount.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),

    /** CHỈ admin (Giám đốc) — kiểm ở RBAC entity `stocktake` action `approve`. */
    approvedBy: uuid("approved_by").references(() => userAccount.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    rejectedBy: uuid("rejected_by").references(() => userAccount.id),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    codeUk: uniqueIndex("stocktake_session_code_uk").on(t.code),
    statusIdx: index("stocktake_session_status_idx").on(t.status, t.createdAt),
  }),
);

/** Phạm vi kiểm — danh sách ô (bin) thuộc phiên. */
export const stocktakeSessionBin = appSchema.table(
  "stocktake_session_bin",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => stocktakeSession.id, { onDelete: "cascade" }),
    binId: uuid("bin_id")
      .notNull()
      .references(() => locationBin.id),
  },
  (t) => ({
    uniq: uniqueIndex("stocktake_session_bin_uk").on(t.sessionId, t.binId),
    binIdx: index("stocktake_session_bin_bin_idx").on(t.binId),
  }),
);

/**
 * 1 dòng đếm = 1 (bin, item, lô) tại thời điểm chụp. `lotSerialId` NULL nếu
 * item không theo dõi lô/không có lô cụ thể tại bin đó lúc chụp (hiếm — hầu
 * hết dòng đều có lô vì `bin_inventory` group theo lot_serial_id).
 */
export const stocktakeLine = appSchema.table(
  "stocktake_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => stocktakeSession.id, { onDelete: "cascade" }),
    binId: uuid("bin_id")
      .notNull()
      .references(() => locationBin.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id),
    lotSerialId: uuid("lot_serial_id").references(() => inventoryLotSerial.id),
    /** Snapshot mã lô lúc chụp — hiển thị nhanh không cần join khi lô đổi trạng thái sau này. */
    lotCodeSnapshot: varchar("lot_code_snapshot", { length: 64 }),

    bookQty: numeric("book_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    countedQty: numeric("counted_qty", { precision: 18, scale: 4 }),
    countedBy: uuid("counted_by").references(() => userAccount.id),
    countedAt: timestamp("counted_at", { withTimezone: true }),
    notes: text("notes"),

    /** inventory_txn ADJUST_PLUS/MINUS ghi khi chốt phiên — null nếu không lệch hoặc chưa chốt. */
    adjustTxnId: uuid("adjust_txn_id").references(() => inventoryTxn.id),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    sessionIdx: index("stocktake_line_session_idx").on(t.sessionId),
    binIdx: index("stocktake_line_bin_idx").on(t.binId),
    itemIdx: index("stocktake_line_item_idx").on(t.itemId),
    // Partial unique: 2 index tách trường hợp có/không có lô (NULL không so
    // sánh bằng trong unique index thường nên phải tách where riêng).
    lotUk: uniqueIndex("stocktake_line_lot_uk")
      .on(t.sessionId, t.binId, t.itemId, t.lotSerialId)
      .where(sql`${t.lotSerialId} IS NOT NULL`),
    nolotUk: uniqueIndex("stocktake_line_nolot_uk")
      .on(t.sessionId, t.binId, t.itemId)
      .where(sql`${t.lotSerialId} IS NULL`),
  }),
);

export type StocktakeSession = typeof stocktakeSession.$inferSelect;
export type NewStocktakeSession = typeof stocktakeSession.$inferInsert;
export type StocktakeSessionBin = typeof stocktakeSessionBin.$inferSelect;
export type StocktakeLine = typeof stocktakeLine.$inferSelect;
export type NewStocktakeLine = typeof stocktakeLine.$inferInsert;
