import { sql } from "drizzle-orm";
import {
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
import { inventoryLotSerial } from "./inventory";
import { bomSnapshotLine } from "./snapshot";
import { workOrder } from "./production";

/**
 * V1.3 Reservation status: ACTIVE (holding) / RELEASED (trả lại) / CONSUMED (scan đã consume).
 */
export const reservationStatusEnum = pgEnum("reservation_status", [
  "ACTIVE",
  "RELEASED",
  "CONSUMED",
]);

/** Lý do chọn lot: FIFO/FEFO auto vs MANUAL / OVERRIDE. */
export const reservationReasonEnum = pgEnum("reservation_reason", [
  "AUTO_FIFO",
  "AUTO_FEFO",
  "MANUAL",
  "OVERRIDE",
]);

/** Bảng reservation — map snapshot_line ↔ lot với reserved_qty + advisory lock per item. */
export const reservation = appSchema.table(
  "reservation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    snapshotLineId: uuid("snapshot_line_id")
      .notNull()
      .references(() => bomSnapshotLine.id, { onDelete: "cascade" }),
    lotSerialId: uuid("lot_serial_id")
      .notNull()
      .references(() => inventoryLotSerial.id),
    woId: uuid("wo_id").references(() => workOrder.id),
    reservedQty: numeric("reserved_qty", { precision: 18, scale: 4 }).notNull(),
    status: reservationStatusEnum("status").notNull().default("ACTIVE"),
    reservationReason: reservationReasonEnum("reservation_reason")
      .notNull()
      .default("AUTO_FIFO"),
    reservedAt: timestamp("reserved_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    reservedBy: uuid("reserved_by").references(() => userAccount.id),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedBy: uuid("released_by").references(() => userAccount.id),
    releaseReason: varchar("release_reason", { length: 64 }),
    notes: text("notes"),
    versionLock: integer("version_lock").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    snapIdx: index("reservation_snap_idx").on(t.snapshotLineId),
    lotIdx: index("reservation_lot_idx").on(t.lotSerialId),
    woIdx: index("reservation_wo_idx").on(t.woId),
    // Partial index cho ACTIVE lookups — migration 0006c đã tạo
  }),
);

export type Reservation = typeof reservation.$inferSelect;
export type NewReservation = typeof reservation.$inferInsert;
export type ReservationStatus =
  (typeof reservationStatusEnum.enumValues)[number];
export type ReservationReason =
  (typeof reservationReasonEnum.enumValues)[number];
