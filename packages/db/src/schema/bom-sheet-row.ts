import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { bomLine } from "./bom";
import { bomSheet } from "./bom-sheet";

/**
 * V2.0 Sprint 6 FIX — rows vật liệu + quy trình per-BOM.
 *
 * Khác material_master/process_master toàn cục:
 *   - master_master = catalog tham chiếu (giá gợi ý, density, name canonical)
 *   - bom_sheet_*_row = data thực tế cho 1 BOM cụ thể (giá deal, phôi,
 *     status, qty, NCC, station)
 *
 * Reference qua soft FK code (không hard FK để cho phép user nhập vật liệu
 * chưa có trong master).
 *
 * Migrations: 0028 rename enum, 0029 material_row, 0030 process_row.
 */

export const materialRowStatusEnum = pgEnum("material_row_status", [
  "PLANNED",
  "ORDERED",
  "DELIVERED",
  "QC_PASS",
  "CANCELLED",
]);

export const bomSheetMaterialRow = appSchema.table(
  "bom_sheet_material_row",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => bomSheet.id, { onDelete: "cascade" }),
    /** Soft FK tới material_master.code (không enforce hard). */
    materialCode: varchar("material_code", { length: 64 }),
    /** Override tên nếu khác master. */
    nameOverride: varchar("name_override", { length: 255 }),
    /** Optional link tới bom_line cụ thể — phôi cho 1 component. */
    componentLineId: uuid("component_line_id").references(() => bomLine.id, {
      onDelete: "set null",
    }),
    /** Giá deal project (snapshot từ master tại thời điểm import). */
    pricePerKg: numeric("price_per_kg", { precision: 18, scale: 2 }),
    qtyKg: numeric("qty_kg", { precision: 18, scale: 4 }),
    /** Phôi: jsonb {l_mm, w_mm, t_mm, shape, qty_pcs} hoặc {freeText: "..."}. */
    blankSize: jsonb("blank_size").notNull().default(sql`'{}'::jsonb`),
    /** NCC dự kiến (text — không FK supplier để linh hoạt). */
    supplierCode: varchar("supplier_code", { length: 64 }),
    status: materialRowStatusEnum("status").notNull().default("PLANNED"),
    /** Text PO code (không FK PO line — defer Sprint 7). */
    purchaseOrderCode: varchar("purchase_order_code", { length: 64 }),
    notes: text("notes"),
    position: integer("position").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    sheetPosIdx: index("bom_sheet_material_row_sheet_pos_idx").on(
      t.sheetId,
      t.position,
    ),
    materialCodeIdx: index("bom_sheet_material_row_material_code_idx").on(
      t.materialCode,
    ),
    statusIdx: index("bom_sheet_material_row_status_idx").on(t.status),
    componentLineIdx: index("bom_sheet_material_row_component_line_idx").on(
      t.componentLineId,
    ),
  }),
);

export const bomSheetProcessRow = appSchema.table(
  "bom_sheet_process_row",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => bomSheet.id, { onDelete: "cascade" }),
    /** Soft FK tới process_master.code. */
    processCode: varchar("process_code", { length: 64 }),
    nameOverride: varchar("name_override", { length: 255 }),
    componentLineId: uuid("component_line_id").references(() => bomLine.id, {
      onDelete: "set null",
    }),
    /** Giờ ước tính cho project. */
    hoursEstimated: numeric("hours_estimated", { precision: 8, scale: 2 }),
    /** Đơn giá deal (snapshot). */
    pricePerUnit: numeric("price_per_unit", { precision: 18, scale: 2 }),
    /** HOUR / CM2 / OTHER — match process_master.pricing_unit. */
    pricingUnit: varchar("pricing_unit", { length: 16 })
      .notNull()
      .default("HOUR"),
    /** Trạm thực hiện (T1, T2, EXTERNAL, OUTSOURCE-X). */
    stationCode: varchar("station_code", { length: 64 }),
    notes: text("notes"),
    position: integer("position").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    sheetPosIdx: index("bom_sheet_process_row_sheet_pos_idx").on(
      t.sheetId,
      t.position,
    ),
    processCodeIdx: index("bom_sheet_process_row_process_code_idx").on(
      t.processCode,
    ),
    componentLineIdx: index("bom_sheet_process_row_component_line_idx").on(
      t.componentLineId,
    ),
  }),
);

export type BomSheetMaterialRow = typeof bomSheetMaterialRow.$inferSelect;
export type NewBomSheetMaterialRow = typeof bomSheetMaterialRow.$inferInsert;
export type BomSheetProcessRow = typeof bomSheetProcessRow.$inferSelect;
export type NewBomSheetProcessRow = typeof bomSheetProcessRow.$inferInsert;
export type MaterialRowStatus =
  (typeof materialRowStatusEnum.enumValues)[number];

export const MATERIAL_ROW_STATUS_LABELS: Record<MaterialRowStatus, string> = {
  PLANNED: "Đã lên kế hoạch",
  ORDERED: "Đã đặt",
  DELIVERED: "Đã giao về",
  QC_PASS: "QC pass",
  CANCELLED: "Đã hủy",
};
