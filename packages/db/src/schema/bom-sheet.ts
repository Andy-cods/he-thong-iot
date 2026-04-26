import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { bomTemplate } from "./bom";

/**
 * V2.0 Sprint 6 — bom_sheet table
 *
 * Phương án D Hybrid (xem plans/redesign-v3/sprint-6-multi-sheet-brainstorm.md):
 * 1 BOM List (`bom_template`) có 1+ sheets. Mỗi sheet 1 trong 4 loại:
 *   - PROJECT: chứa bom_lines (cấu trúc sản phẩm — link ngược qua bom_line.sheet_id)
 *   - MATERIAL_REF: reference master vật liệu toàn cục — chỉ metadata filter,
 *     data thật ở material_master
 *   - PROCESS_REF: tương tự cho quy trình
 *   - CUSTOM: sheet free-form (note, hướng dẫn, đặc tả khách)
 *
 * File Excel "Bản chính thức" 3 sheets → 1 bom_template + 3 bom_sheet rows.
 *
 * Migrations: 0025_bom_sheet.sql (table), 0026_bom_line_sheet_link.sql
 * (FK + trigger), 0027_bom_sheet_backfill.sql (data + NOT NULL).
 */

export const bomSheetKindEnum = pgEnum("bom_sheet_kind", [
  "PROJECT",
  "MATERIAL",
  "PROCESS",
  "CUSTOM",
]);

export const bomSheet = appSchema.table(
  "bom_sheet",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => bomTemplate.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    kind: bomSheetKindEnum("kind").notNull().default("PROJECT"),
    position: integer("position").notNull().default(1),
    /**
     * metadata jsonb chứa context per-kind:
     *   - PROJECT: { sourceSheetName, titleRow, headerRow }
     *   - MATERIAL_REF: { filterCategories?, usedMaterialCodes? }
     *   - PROCESS_REF: { filterUnits?, usedProcessCodes? }
     *   - CUSTOM: { content, attachments? }
     */
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
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
    templatePosIdx: index("bom_sheet_template_pos_idx").on(
      t.templateId,
      t.position,
    ),
    kindIdx: index("bom_sheet_kind_idx").on(t.kind),
    templateNameUk: uniqueIndex("bom_sheet_template_name_uk").on(
      t.templateId,
      t.name,
    ),
  }),
);

export type BomSheet = typeof bomSheet.$inferSelect;
export type NewBomSheet = typeof bomSheet.$inferInsert;
export type BomSheetKind = (typeof bomSheetKindEnum.enumValues)[number];

export const BOM_SHEET_KIND_LABELS: Record<BomSheetKind, string> = {
  PROJECT: "Cấu trúc BOM",
  MATERIAL: "Vật liệu",
  PROCESS: "Quy trình gia công",
  CUSTOM: "Tuỳ chỉnh",
};
