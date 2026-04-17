import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";

/** 4 role cứng V1 theo plan 2.1 + 5.3. */
export const roleCodeEnum = pgEnum("role_code", [
  "admin",
  "planner",
  "warehouse",
  "operator",
]);

/** Bảng 1: user_account */
export const userAccount = appSchema.table(
  "user_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 64 }).notNull(),
    email: varchar("email", { length: 255 }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecret: text("mfa_secret"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    failedLoginCount: varchar("failed_login_count", { length: 8 })
      .notNull()
      .default("0"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    usernameIdx: uniqueIndex("user_account_username_uk").on(t.username),
    emailIdx: uniqueIndex("user_account_email_uk")
      .on(t.email)
      .where(sql`${t.email} IS NOT NULL`),
  }),
);

/** Bảng 2: role */
export const role = appSchema.table(
  "role",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: roleCodeEnum("code").notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    codeIdx: uniqueIndex("role_code_uk").on(t.code),
  }),
);

/** Bảng 3: user_role (N:M) */
export const userRole = appSchema.table(
  "user_role",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    assignedBy: uuid("assigned_by").references(() => userAccount.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
    roleIdx: index("user_role_role_idx").on(t.roleId),
  }),
);

/** Session (refresh token rotation). */
export const session = appSchema.table(
  "session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 64 }),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedBySessionId: uuid("replaced_by_session_id"),
  },
  (t) => ({
    userIdx: index("session_user_idx").on(t.userId),
    tokenIdx: uniqueIndex("session_token_uk").on(t.refreshTokenHash),
    expIdx: index("session_exp_idx").on(t.expiresAt),
  }),
);

export type UserAccount = typeof userAccount.$inferSelect;
export type NewUserAccount = typeof userAccount.$inferInsert;
export type Role = typeof role.$inferSelect;
export type Session = typeof session.$inferSelect;
