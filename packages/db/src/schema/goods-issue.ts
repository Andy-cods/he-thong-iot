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
import { item, locationBin } from "./master";
import { inventoryLotSerial, inventoryTxn } from "./inventory";
import { workOrder } from "./production";
import { materialRequest, materialRequestLine } from "./material-request";
import { warehouseIssueRequest } from "./warehouse-location";

/**
 * V4.1 Đợt 1b — Phiếu xuất kho (goods issue), số `PX-YYMM-NNNN`.
 *
 * Khớp tay migration `0060_goods_issue.sql` (KHÔNG drizzle-kit push).
 *
 * Mọi đường xuất kho sinh 1 phiếu, cùng transaction với inventory_txn
 * OUT_ISSUE (`ref_table='goods_issue'`, `ref_id` = id phiếu):
 *   - MATERIAL_REQUEST — giao phiếu yêu cầu vật tư (giao từng phần được);
 *   - QUICK_ISSUE      — xuất nhanh ở tab Kho;
 *   - ISSUE_REQUEST    — duyệt yêu cầu xuất kho (ISR) — 1 ISR ↔ tối đa 1 phiếu.
 * Bán hàng / trả NCC phân biệt bằng `reason` (sales / return).
 */
export const goodsIssue = appSchema.table(
  "goods_issue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    issueNo: varchar("issue_no", { length: 32 }).notNull(),
    /** MATERIAL_REQUEST | QUICK_ISSUE | ISSUE_REQUEST (CHECK ở DB). */
    sourceType: varchar("source_type", { length: 24 }).notNull(),
    /** production | sales | manual | loss | return | other (CHECK ở DB). */
    reason: varchar("reason", { length: 16 }).notNull().default("production"),
    materialRequestId: uuid("material_request_id").references(
      () => materialRequest.id,
    ),
    issueRequestId: uuid("issue_request_id").references(
      () => warehouseIssueRequest.id,
    ),
    woId: uuid("wo_id").references(() => workOrder.id),
    reference: varchar("reference", { length: 64 }),
    notes: text("notes"),
    totalQty: numeric("total_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    issuedBy: uuid("issued_by")
      .notNull()
      .references(() => userAccount.id),
    receivedBy: uuid("received_by").references(() => userAccount.id),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    issueNoUk: uniqueIndex("goods_issue_no_uk").on(t.issueNo),
    // Partial unique (WHERE issue_request_id IS NOT NULL) — khai ở SQL 0060.
    isrUk: uniqueIndex("goods_issue_isr_uk")
      .on(t.issueRequestId)
      .where(sql`${t.issueRequestId} IS NOT NULL`),
    mrIdx: index("goods_issue_mr_idx").on(t.materialRequestId),
    issuedAtIdx: index("goods_issue_issued_at_idx").on(t.issuedAt),
    sourceIdx: index("goods_issue_source_idx").on(t.sourceType, t.issuedAt),
  }),
);

export const goodsIssueLine = appSchema.table(
  "goods_issue_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    goodsIssueId: uuid("goods_issue_id")
      .notNull()
      .references(() => goodsIssue.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id),
    lotSerialId: uuid("lot_serial_id")
      .notNull()
      .references(() => inventoryLotSerial.id),
    binId: uuid("bin_id")
      .notNull()
      .references(() => locationBin.id),
    qty: numeric("qty", { precision: 18, scale: 4 }).notNull(),
    inventoryTxnId: uuid("inventory_txn_id")
      .notNull()
      .references(() => inventoryTxn.id),
    materialRequestLineId: uuid("material_request_line_id").references(
      () => materialRequestLine.id,
    ),
    notes: text("notes"),
  },
  (t) => ({
    uk: uniqueIndex("goods_issue_line_uk").on(t.goodsIssueId, t.lineNo),
    txnUk: uniqueIndex("goods_issue_line_txn_uk").on(t.inventoryTxnId),
    itemIdx: index("goods_issue_line_item_idx").on(t.itemId),
    mrlIdx: index("goods_issue_line_mrl_idx").on(t.materialRequestLineId),
  }),
);

export type GoodsIssue = typeof goodsIssue.$inferSelect;
export type NewGoodsIssue = typeof goodsIssue.$inferInsert;
export type GoodsIssueLine = typeof goodsIssueLine.$inferSelect;
export type NewGoodsIssueLine = typeof goodsIssueLine.$inferInsert;
