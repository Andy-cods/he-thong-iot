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
import { bomTemplate } from "./bom";
import { workOrder } from "./production";
import { inventoryLotSerial } from "./inventory";

/**
 * V3.3 — Material Request: yêu cầu xuất kho linh kiện.
 *
 * Flow: engineer tạo (PENDING) → warehouse PICKING → READY → engineer DELIVERED.
 * Notifications gửi tự động ở mỗi transition.
 */
export const materialRequest = appSchema.table(
  "material_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestNo: varchar("request_no", { length: 64 }).notNull(),
    bomTemplateId: uuid("bom_template_id").references(() => bomTemplate.id, {
      onDelete: "set null",
    }),
    woId: uuid("wo_id").references(() => workOrder.id, { onDelete: "set null" }),
    status: varchar("status", { length: 16 }).notNull().default("PENDING"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => userAccount.id),
    pickedBy: uuid("picked_by").references(() => userAccount.id),
    deliveredTo: uuid("delivered_to").references(() => userAccount.id),
    pickedAt: timestamp("picked_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    notes: text("notes"),
    warehouseNotes: text("warehouse_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    requestNoUk: uniqueIndex("material_request_no_uk").on(t.requestNo),
    statusIdx: index("material_request_status_idx").on(t.status, t.createdAt),
    requesterIdx: index("material_request_requester_idx").on(
      t.requestedBy,
      t.createdAt,
    ),
    bomIdx: index("material_request_bom_idx").on(t.bomTemplateId),
  }),
);

export const materialRequestLine = appSchema.table(
  "material_request_line",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => materialRequest.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id),
    requestedQty: numeric("requested_qty", { precision: 18, scale: 4 }).notNull(),
    pickedQty: numeric("picked_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    deliveredQty: numeric("delivered_qty", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    lotSerialId: uuid("lot_serial_id").references(() => inventoryLotSerial.id),
    notes: text("notes"),
  },
  (t) => ({
    requestIdx: index("material_request_line_request_idx").on(t.requestId),
    itemIdx: index("material_request_line_item_idx").on(t.itemId),
  }),
);

export type MaterialRequest = typeof materialRequest.$inferSelect;
export type NewMaterialRequest = typeof materialRequest.$inferInsert;
export type MaterialRequestLine = typeof materialRequestLine.$inferSelect;
export type NewMaterialRequestLine = typeof materialRequestLine.$inferInsert;
