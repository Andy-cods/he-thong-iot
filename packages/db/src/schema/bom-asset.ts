import { sql } from "drizzle-orm";
import {
  bigserial,
  char,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { bomLine } from "./bom";

/** BOM V5 (migration 0083) — kho ảnh dedup theo sha256. */
export const bomAsset = appSchema.table(
  "bom_asset",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sha256: char("sha256", { length: 64 }).notNull(),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    pathFull: text("path_full").notNull(),
    pathThumb: text("path_thumb").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    sha256Uk: uniqueIndex("bom_asset_sha256_uk").on(t.sha256),
  }),
);

/** BOM V5 (migration 0083) — lịch sử đổi trường dòng BOM (NCC, SL...). */
export const bomLineChange = appSchema.table(
  "bom_line_change",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => bomLine.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").notNull(),
    field: text("field").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    actorId: uuid("actor_id"),
    at: timestamp("at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    lineIdx: index("bom_line_change_line_idx").on(t.lineId, sql`${t.at} DESC`),
  }),
);
