import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  index,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { bomLine } from "./bom";

/**
 * BOM V5 (migration 0085) — sổ bước, APPEND-ONLY (trigger DB chặn UPDATE/DELETE).
 * Sửa sai bằng bút toán đảo (reversesId). Không UPDATE/DELETE bảng này từ app.
 */
export const bomStageMove = appSchema.table(
  "bom_stage_move",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => bomLine.id),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),
    qty: numeric("qty", { precision: 18, scale: 4 }).notNull(),
    /** MANUAL|PR|PO|RECEIVING|WO|ISSUE|DELIVERY_SLIP */
    docType: text("doc_type").notNull(),
    docId: text("doc_id"),
    note: text("note"),
    actorId: uuid("actor_id"),
    at: timestamp("at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    reversesId: bigint("reverses_id", { mode: "number" }).references(
      (): AnyPgColumn => bomStageMove.id,
    ),
  },
  (t) => ({
    lineIdx: index("bom_stage_move_line_idx").on(t.lineId),
    // Idempotent: partial unique (doc_id NOT NULL, doc_type <> 'MANUAL').
    docUk: uniqueIndex("bom_stage_move_doc_uk")
      .on(
        t.docType,
        t.docId,
        t.lineId,
        sql`(coalesce(${t.fromStage}, ''))`,
        t.toStage,
        sql`(coalesce(${t.reversesId}, 0))`,
      )
      .where(sql`${t.docId} IS NOT NULL AND ${t.docType} <> 'MANUAL'`),
    qtyPos: check("bom_stage_move_qty_pos_chk", sql`${t.qty} > 0`),
  }),
);
