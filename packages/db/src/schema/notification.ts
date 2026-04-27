import { sql } from "drizzle-orm";
import {
  index,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { roleCodeEnum, userAccount } from "./auth";

/**
 * V3.3 — Notification table.
 *
 * In-app message cho cross-department workflow:
 *   - PR submitted → notify purchaser
 *   - PR approved → notify engineer (creator)
 *   - PO sent → notify warehouse
 *   - PO received → notify purchaser + engineer (creator)
 *   - WO released → notify operator
 *   - WO completed → notify engineer + warehouse
 *   - Material Request → notify warehouse / engineer
 *
 * Recipient: hoặc user cụ thể (recipient_user) hoặc broadcast theo role
 * (recipient_role). Khi cả 2 set → user-specific ưu tiên (badge unread).
 */
export const notification = appSchema.table(
  "notification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipientUser: uuid("recipient_user").references(() => userAccount.id, {
      onDelete: "cascade",
    }),
    recipientRole: roleCodeEnum("recipient_role"),
    actorUserId: uuid("actor_user_id").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    actorUsername: varchar("actor_username", { length: 64 }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    entityType: varchar("entity_type", { length: 32 }),
    entityId: uuid("entity_id"),
    entityCode: varchar("entity_code", { length: 64 }),
    title: text("title").notNull(),
    message: text("message"),
    link: text("link"),
    severity: varchar("severity", { length: 16 }).notNull().default("info"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    recipientUserIdx: index("notification_recipient_user_idx").on(
      t.recipientUser,
      t.readAt,
      t.createdAt,
    ),
    recipientRoleIdx: index("notification_recipient_role_idx").on(
      t.recipientRole,
      t.readAt,
      t.createdAt,
    ),
    entityIdx: index("notification_entity_idx").on(t.entityType, t.entityId),
  }),
);

export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;
