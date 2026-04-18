import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";

export const auditActionEnum = pgEnum("audit_action", [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "RELEASE",
  "SNAPSHOT",
  "POST",
  "CANCEL",
  "UPLOAD",
  "COMMIT",
  // V1.2 additions (migration 0005a ALTER TYPE ADD VALUE)
  "TRANSITION",
  "RESERVE",
  "ISSUE",
  "RECEIVE",
  "APPROVE",
  "CONVERT",
]);

/** Bảng 19: audit_event */
export const auditEvent = appSchema.table(
  "audit_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => userAccount.id),
    actorUsername: varchar("actor_username", { length: 64 }),
    action: auditActionEnum("action").notNull(),
    objectType: varchar("object_type", { length: 64 }).notNull(),
    objectId: uuid("object_id"),
    requestId: varchar("request_id", { length: 64 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    notes: text("notes"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    actorIdx: index("audit_event_actor_idx").on(t.actorUserId, t.occurredAt),
    objectIdx: index("audit_event_object_idx").on(t.objectType, t.objectId),
    actionIdx: index("audit_event_action_idx").on(t.action),
    occurredIdx: index("audit_event_occurred_idx").on(t.occurredAt),
  }),
);

/**
 * NOTE: `eco_request` table (V1.5+ ECO workflow) tạm thời KHÔNG expose qua Drizzle
 * schema TypeScript vì phụ thuộc `bom_revision` — đã loại khỏi V1.1-alpha.
 * DB vẫn giữ nguyên bảng nếu đã tạo ở môi trường nào đó; khi cần resurrect sẽ
 * cook lại ở sprint ECO (V1.5+).
 */

export type AuditEvent = typeof auditEvent.$inferSelect;
