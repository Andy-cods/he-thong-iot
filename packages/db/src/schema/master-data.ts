import { sql } from "drizzle-orm";
import {
  boolean,
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

/**
 * V2.0 Phase 2 — master vật liệu + quy trình từ Excel sheet 3 "Material&Process".
 * Migration: 0017_material_process_master.sql.
 *
 * Mục đích:
 *   - Cost calculator (phase 2 sau) join material+process tính giá thành.
 *   - Item form dropdown chọn material_code (FK qua migration 0018 thêm
 *     `item.material_code`).
 *   - Admin UI /admin/materials + /admin/processes CRUD.
 */

/**
 * Đơn vị giá quy trình. HOUR mặc định, CM2 cho Anodizing đặc thù.
 *
 * V3.11.4 (audit W.9) — CỘT LÀ varchar(32) trên DB thực (migration 0017 tạo
 * `pricing_unit VARCHAR(32)`, KHÔNG phải enum). Trước đây TS khai pgEnum
 * `process_pricing_unit` không tồn tại trên DB → `drizzle-kit push` tương lai
 * sẽ sinh ALTER convert cột→enum (nguy hiểm trên prod). Giữ giá trị hợp lệ ở
 * tầng ứng dụng bằng union literal + Zod, cột DB là varchar.
 */
export const PROCESS_PRICING_UNITS = ["HOUR", "CM2", "OTHER"] as const;

/**
 * Bảng 23a — material_master.
 * Seed 23 vật liệu từ Excel sheet 3 (POM/PB108/PVC/AL6061/SUS304/...).
 */
export const materialMaster = appSchema.table(
  "material_master",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    nameEn: varchar("name_en", { length: 255 }).notNull(),
    nameVn: varchar("name_vn", { length: 255 }).notNull(),
    /**
     * Phân nhóm để filter UI — POM / PB108 / PVC / URETHANE / TEFLON /
     * BAKELITE / MIKA / PC / PEEK / ULTEM / ALUMINIUM / COPPER / STEEL /
     * STAINLESS_STEEL / DUROSTONE / PI108 / PE_FOAM / SILICON / TITAN / OTHER.
     */
    category: varchar("category", { length: 64 }),
    /** Giá/kg VND. NULL = chưa xác định. */
    pricePerKg: numeric("price_per_kg", { precision: 18, scale: 2 }),
    /** Mật độ kg/m³ — optional, để tính trọng lượng từ kích thước. */
    densityKgM3: numeric("density_kg_m3", { precision: 8, scale: 2 }),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
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
    codeUk: uniqueIndex("material_master_code_uk").on(t.code),
    categoryIdx: index("material_master_category_idx").on(t.category),
    activeIdx: index("material_master_active_idx").on(t.isActive),
  }),
);

/**
 * Bảng 23b — process_master.
 * Seed 11 quy trình từ Excel sheet 3 (MCT/Milling/Anodizing/...).
 * `pricingUnit` HOUR (mặc định) hoặc CM2 (Anodizing 115đ/cm²).
 */
export const processMaster = appSchema.table(
  "process_master",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    nameEn: varchar("name_en", { length: 255 }).notNull(),
    nameVn: varchar("name_vn", { length: 255 }).notNull(),
    /** Giá/đơn vị — null nếu chưa xác định. */
    pricePerUnit: numeric("price_per_unit", { precision: 18, scale: 2 }),
    pricingUnit: varchar("pricing_unit", { length: 32 })
      .notNull()
      .default("HOUR")
      .$type<ProcessPricingUnit>(),
    pricingNote: text("pricing_note"),
    isActive: boolean("is_active").notNull().default(true),
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
    codeUk: uniqueIndex("process_master_code_uk").on(t.code),
    activeIdx: index("process_master_active_idx").on(t.isActive),
  }),
);

export type MaterialMaster = typeof materialMaster.$inferSelect;
export type NewMaterialMaster = typeof materialMaster.$inferInsert;
export type ProcessMaster = typeof processMaster.$inferSelect;
export type NewProcessMaster = typeof processMaster.$inferInsert;
export type ProcessPricingUnit = (typeof PROCESS_PRICING_UNITS)[number];
