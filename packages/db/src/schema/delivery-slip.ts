import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { bomLine, bomTemplate } from "./bom";
import { supplier } from "./master";

/**
 * BOM V5 (migration 0086) — Phiếu giao nội bộ/NTP. Bảng MỚI, không liên quan
 * `delivery_note` (BBGH). Số phiếu: GT-PG{yymmdd}-0{n}, n theo ngày.
 * kind: SURFACE | ASSEMBLY. status: SENT|PARTIAL_RECEIVED|RECEIVED|CANCELLED.
 */
export const deliverySlip = appSchema.table(
  "delivery_slip",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slipNo: varchar("slip_no", { length: 32 }).notNull(),
    kind: text("kind").notNull(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => bomTemplate.id),
    projectCode: text("project_code"),
    supplierId: uuid("supplier_id").references(() => supplier.id),
    recipientText: text("recipient_text"),
    status: text("status").notNull().default("SENT"),
    batchNo: integer("batch_no").notNull().default(1),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    slipNoUk: uniqueIndex("delivery_slip_no_uk").on(t.slipNo),
    templateIdx: index("delivery_slip_template_idx").on(t.templateId, t.kind),
    kindChk: check("delivery_slip_kind_chk", sql`${t.kind} IN ('SURFACE','ASSEMBLY')`),
    statusChk: check(
      "delivery_slip_status_chk",
      sql`${t.status} IN ('SENT','PARTIAL_RECEIVED','RECEIVED','CANCELLED')`,
    ),
    surfaceSupplierChk: check(
      "delivery_slip_surface_supplier_chk",
      sql`${t.kind} <> 'SURFACE' OR ${t.supplierId} IS NOT NULL`,
    ),
  }),
);

export const deliverySlipLine = appSchema.table(
  "delivery_slip_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slipId: uuid("slip_id")
      .notNull()
      .references(() => deliverySlip.id, { onDelete: "cascade" }),
    lineId: uuid("line_id")
      .notNull()
      .references(() => bomLine.id),
    stt: integer("stt").notNull(),
    fromStage: text("from_stage").notNull(),
    toStage: text("to_stage").notNull(),
    qtyDoc: numeric("qty_doc", { precision: 18, scale: 4 }).notNull(),
    qtyReceived: numeric("qty_received", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    unitPrice: numeric("unit_price", { precision: 18, scale: 2 }),
    note: text("note"),
    /** Snapshot tên/quy cách/xử lý bề mặt/mã tại lúc lập phiếu. */
    snap: jsonb("snap").notNull(),
  },
  (t) => ({
    slipIdx: index("delivery_slip_line_slip_idx").on(t.slipId),
    lineIdx: index("delivery_slip_line_line_idx").on(t.lineId),
    qtyDocChk: check("delivery_slip_line_qty_doc_chk", sql`${t.qtyDoc} > 0`),
    qtyRecvChk: check("delivery_slip_line_qty_recv_chk", sql`${t.qtyReceived} >= 0`),
  }),
);

/** Sequence theo ngày (app tính `day` theo Asia/Ho_Chi_Minh). */
export const deliverySlipSeq = appSchema.table("delivery_slip_seq", {
  day: date("day").primaryKey(),
  last: integer("last").notNull(),
});
