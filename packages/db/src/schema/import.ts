import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";

// V4.0 đợt 2 — thêm "finance_transaction" (Postgres enum được ALTER TYPE ADD
// VALUE ở migration 0055_finance_core.sql, SAU khi drizzle-kit push tạo bảng
// fin_*; xem wave-2-finance.md §0.2/§D.2). Cập nhật TS ở đây để đồng bộ
// type-safety cho `import_batch.kind` — KHÔNG làm drizzle-kit push cố tạo lại
// enum (Drizzle diff theo tên, giá trị đã tồn tại trên DB → no-op).
export const importKindEnum = pgEnum("import_kind", [
  "item",
  "bom",
  "finance_transaction",
]);

export const importStatusEnum = pgEnum("import_status", [
  "queued",
  "parsing",
  "preview_ready",
  "committing",
  "done",
  "failed",
]);

export const importDuplicateModeEnum = pgEnum("import_duplicate_mode", [
  "skip",
  "upsert",
  "error",
]);

/** Bảng 21: import_batch — trạng thái 1 lần upload Excel, giữ history & dedup theo fileHash. */
export const importBatch = appSchema.table(
  "import_batch",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: importKindEnum("kind").notNull(),
    status: importStatusEnum("status").notNull().default("queued"),
    duplicateMode: importDuplicateModeEnum("duplicate_mode")
      .notNull()
      .default("skip"),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull().default(0),
    fileKey: text("file_key"),
    rowTotal: integer("row_total").notNull().default(0),
    rowSuccess: integer("row_success").notNull().default(0),
    rowFail: integer("row_fail").notNull().default(0),
    previewJson: jsonb("preview_json"),
    errorJson: jsonb("error_json"),
    errorFileUrl: text("error_file_url"),
    errorMessage: text("error_message"),
    uploadedBy: uuid("uploaded_by").references(() => userAccount.id),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    hashIdx: index("import_batch_hash_idx").on(t.fileHash, t.kind),
    statusIdx: index("import_batch_status_idx").on(t.status),
    uploadedByIdx: index("import_batch_uploaded_by_idx").on(t.uploadedBy),
    createdIdx: index("import_batch_created_idx").on(t.createdAt),
  }),
);

export type ImportBatch = typeof importBatch.$inferSelect;
export type NewImportBatch = typeof importBatch.$inferInsert;
