import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { bomAsset } from "./bom-asset";

/**
 * V4.10 (TASK-20261118-001) — Sản lượng ca cho xưởng vệ tinh (Đông Anh).
 * Migration: 0087a_shift_output_role.sql (enum, ngoài transaction) +
 * 0087b_shift_output.sql (11 bảng + seed DONGAN). Áp tay, KHÔNG drizzle push.
 *
 * "Site" là chiều nhẹ chỉ của module này (KHÔNG thêm tenant_id vào bảng cũ).
 * Danh mục có UNIQUE (site_id, id) để dòng sản lượng tham chiếu bằng FK GHÉP
 * (site_id, xxx_id) → DB tự chặn trộn máy/ca/mã hàng của site khác.
 */

const auditCols = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  createdBy: uuid("created_by").references(() => userAccount.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedBy: uuid("updated_by").references(() => userAccount.id, { onDelete: "set null" }),
});

export const site = appSchema.table(
  "site",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Ho_Chi_Minh"),
    /** Q2 — dòng tự khoá sau N giờ kể từ giờ kết thúc ca (0–720). */
    lockAfterHours: integer("lock_after_hours").notNull().default(24),
    /** V6 — nhập lùi tối đa N ngày; quá hạn cần quyền approve (0–31). */
    backdateDays: integer("backdate_days").notNull().default(2),
    /** V3 — %NG vượt ngưỡng → hỏi xác nhận. */
    ngWarnPct: numeric("ng_warn_pct", { precision: 5, scale: 2 }).notNull().default("10"),
    isActive: boolean("is_active").notNull().default(true),
    ...auditCols(),
  },
  (t) => ({ codeUk: uniqueIndex("site_code_uk").on(t.code) }),
);

/** 1 user ≤ 1 site (PK = user_id). Workshop bắt buộc có; admin không cần. */
export const userSite = appSchema.table("user_site", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  siteId: uuid("site_id")
    .notNull()
    .references(() => site.id),
  assignedBy: uuid("assigned_by").references(() => userAccount.id, { onDelete: "set null" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const siteMachine = appSchema.table(
  "site_machine",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id").notNull().references(() => site.id),
    code: varchar("code", { length: 48 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    model: varchar("model", { length: 120 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...auditCols(),
  },
  (t) => ({
    codeUk: uniqueIndex("site_machine_code_uk").on(t.siteId, t.code),
    siteIdUk: unique("site_machine_site_id_uk").on(t.siteId, t.id),
  }),
);

export const siteShift = appSchema.table(
  "site_shift",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id").notNull().references(() => site.id),
    code: varchar("code", { length: 48 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    crossesMidnight: boolean("crosses_midnight").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...auditCols(),
  },
  (t) => ({
    codeUk: uniqueIndex("site_shift_code_uk").on(t.siteId, t.code),
    siteIdUk: unique("site_shift_site_id_uk").on(t.siteId, t.id),
  }),
);

export const sitePart = appSchema.table(
  "site_part",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id").notNull().references(() => site.id),
    code: varchar("code", { length: 48 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    drawingNo: varchar("drawing_no", { length: 64 }),
    revision: varchar("revision", { length: 16 }),
    customerName: varchar("customer_name", { length: 120 }),
    /** P2 — cycle time chuẩn (giây) cho OEE Performance. */
    stdCycleSec: integer("std_cycle_sec"),
    /** 0089 — ảnh sản phẩm (kho ảnh dedup bom_asset; file ở UPLOAD_DIR/bom/). */
    imageAssetId: uuid("image_asset_id").references(() => bomAsset.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    ...auditCols(),
  },
  (t) => ({
    codeUk: uniqueIndex("site_part_code_uk").on(t.siteId, t.code),
    siteIdUk: unique("site_part_site_id_uk").on(t.siteId, t.id),
  }),
);

export const siteOperator = appSchema.table(
  "site_operator",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id").notNull().references(() => site.id),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    shortName: varchar("short_name", { length: 32 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...auditCols(),
  },
  (t) => ({
    // unique(site_id, lower(full_name)) — tạo bằng SQL (expression index).
    siteIdUk: unique("site_operator_site_id_uk").on(t.siteId, t.id),
  }),
);

export const siteDefectReason = appSchema.table(
  "site_defect_reason",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id").notNull().references(() => site.id),
    code: varchar("code", { length: 48 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...auditCols(),
  },
  (t) => ({
    codeUk: uniqueIndex("site_defect_reason_code_uk").on(t.siteId, t.code),
    siteIdUk: unique("site_defect_reason_site_id_uk").on(t.siteId, t.id),
  }),
);

export const siteDowntimeReason = appSchema.table(
  "site_downtime_reason",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id").notNull().references(() => site.id),
    code: varchar("code", { length: 48 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    /** Dừng có kế hoạch (setup, bảo dưỡng, không có KH) — tách khi phân tích. */
    isPlanned: boolean("is_planned").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...auditCols(),
  },
  (t) => ({
    codeUk: uniqueIndex("site_downtime_reason_code_uk").on(t.siteId, t.code),
    siteIdUk: unique("site_downtime_reason_site_id_uk").on(t.siteId, t.id),
  }),
);

/** 1 dòng = 1 (ngày, ca, máy, mã hàng). Sản xuất = OK + NG. */
export const shiftOutputEntry = appSchema.table(
  "shift_output_entry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id").notNull().references(() => site.id),
    clientUuid: uuid("client_uuid").notNull(),
    prodDate: date("prod_date").notNull(),
    shiftId: uuid("shift_id").notNull(),
    machineId: uuid("machine_id").notNull(),
    partId: uuid("part_id").notNull(),
    operatorId: uuid("operator_id"),
    operatorName: varchar("operator_name", { length: 120 }),
    qtyPlanned: integer("qty_planned"),
    qtyOk: integer("qty_ok").notNull().default(0),
    qtyNg: integer("qty_ng").notNull().default(0),
    qtyRework: integer("qty_rework"),
    downtimeMin: integer("downtime_min"),
    /**
     * Phút khả dụng của dòng (snapshot): có giờ thực tế → phút(workStart→workEnd);
     * không (dòng P1) → độ dài ca lúc nhập. Đổi giờ ca không làm sai lịch sử.
     */
    shiftMinutes: integer("shift_minutes").notNull(),
    /** 0089 — giờ chạy thực tế (giờ địa phương site); workEnd <= workStart = qua nửa đêm. Cả 2 NULL = dòng P1. */
    workStart: time("work_start"),
    workEnd: time("work_end"),
    materialLot: varchar("material_lot", { length: 64 }),
    notes: text("notes"),
    status: varchar("status", { length: 16 }).notNull().default("SUBMITTED"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: uuid("locked_by").references(() => userAccount.id, { onDelete: "set null" }),
    source: varchar("source", { length: 16 }).notNull().default("APP"),
    version: integer("version").notNull().default(1),
    ...auditCols(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => userAccount.id, { onDelete: "set null" }),
    deleteReason: text("delete_reason"),
  },
  (t) => ({
    clientUuidUk: uniqueIndex("shift_output_entry_client_uuid_uk").on(t.clientUuid),
    slotUk: uniqueIndex("shift_output_entry_slot_uk")
      .on(t.siteId, t.prodDate, t.shiftId, t.machineId, t.partId)
      .where(sql`${t.deletedAt} IS NULL`),
    siteDateIdx: index("shift_output_entry_site_date_idx").on(t.siteId, t.prodDate),
    siteMachineIdx: index("shift_output_entry_site_machine_idx").on(t.siteId, t.machineId, t.prodDate),
    sitePartIdx: index("shift_output_entry_site_part_idx").on(t.siteId, t.partId, t.prodDate),
    shiftFk: foreignKey({
      name: "shift_output_entry_shift_fk",
      columns: [t.siteId, t.shiftId],
      foreignColumns: [siteShift.siteId, siteShift.id],
    }),
    machineFk: foreignKey({
      name: "shift_output_entry_machine_fk",
      columns: [t.siteId, t.machineId],
      foreignColumns: [siteMachine.siteId, siteMachine.id],
    }),
    partFk: foreignKey({
      name: "shift_output_entry_part_fk",
      columns: [t.siteId, t.partId],
      foreignColumns: [sitePart.siteId, sitePart.id],
    }),
    operatorFk: foreignKey({
      name: "shift_output_entry_operator_fk",
      columns: [t.siteId, t.operatorId],
      foreignColumns: [siteOperator.siteId, siteOperator.id],
    }),
  }),
);

export const shiftOutputDefect = appSchema.table(
  "shift_output_defect",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => shiftOutputEntry.id, { onDelete: "cascade" }),
    reasonId: uuid("reason_id")
      .notNull()
      .references(() => siteDefectReason.id),
    qty: integer("qty").notNull(),
  },
  (t) => ({ entryReasonUk: uniqueIndex("shift_output_defect_uk").on(t.entryId, t.reasonId) }),
);

export const shiftOutputDowntime = appSchema.table(
  "shift_output_downtime",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => shiftOutputEntry.id, { onDelete: "cascade" }),
    reasonId: uuid("reason_id")
      .notNull()
      .references(() => siteDowntimeReason.id),
    minutes: integer("minutes").notNull(),
    note: varchar("note", { length: 200 }),
  },
  (t) => ({ entryReasonUk: uniqueIndex("shift_output_downtime_uk").on(t.entryId, t.reasonId) }),
);

export type Site = typeof site.$inferSelect;
export type SiteMachine = typeof siteMachine.$inferSelect;
export type SiteShift = typeof siteShift.$inferSelect;
export type SitePart = typeof sitePart.$inferSelect;
export type SiteOperator = typeof siteOperator.$inferSelect;
export type SiteDefectReason = typeof siteDefectReason.$inferSelect;
export type SiteDowntimeReason = typeof siteDowntimeReason.$inferSelect;
export type ShiftOutputEntry = typeof shiftOutputEntry.$inferSelect;
export type ShiftOutputDefect = typeof shiftOutputDefect.$inferSelect;
export type ShiftOutputDowntime = typeof shiftOutputDowntime.$inferSelect;
