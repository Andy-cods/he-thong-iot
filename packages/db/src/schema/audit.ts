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
import { bomRevision } from "./bom";

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

/** Bảng 20: eco_request (STUB — chưa dùng V1, giữ schema để V1.5+ không vỡ) */
export const ecoRequestStatusEnum = pgEnum("eco_request_status", [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "APPLIED",
]);

export const ecoRequest = appSchema.table(
  "eco_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ecoNo: varchar("eco_no", { length: 64 }).notNull(),
    bomRevisionId: uuid("bom_revision_id").references(() => bomRevision.id),
    status: ecoRequestStatusEnum("status").notNull().default("DRAFT"),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    requestedBy: uuid("requested_by").references(() => userAccount.id),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => userAccount.id),
  },
  (t) => ({
    ecoNoIdx: index("eco_request_no_idx").on(t.ecoNo),
    statusIdx: index("eco_request_status_idx").on(t.status),
  }),
);

export type AuditEvent = typeof auditEvent.$inferSelect;
export type EcoRequest = typeof ecoRequest.$inferSelect;
