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

/**
 * Role cứng — V3.3 thêm "purchaser" (Bộ phận Thu mua).
 * Khớp với ROLES trong @iot/shared.
 */
export const roleCodeEnum = pgEnum("role_code", [
  "admin",
  "planner",
  "warehouse",
  "operator",
  "purchaser",
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
    // V1.4 — Admin reset password + self-reset stub
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(false),
    passwordResetTokenHash: text("password_reset_token_hash"),
    passwordResetExpiresAt: timestamp("password_reset_expires_at", {
      withTimezone: true,
    }),
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
    // V1.4 — hiển thị "Last seen" trong session mgmt UI
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    replacedBySessionId: uuid("replaced_by_session_id"),
  },
  (t) => ({
    userIdx: index("session_user_idx").on(t.userId),
    tokenIdx: uniqueIndex("session_token_uk").on(t.refreshTokenHash),
    expIdx: index("session_exp_idx").on(t.expiresAt),
  }),
);

/**
 * V1.9 P10 — per-user permission override.
 * Một row = 1 cell trong matrix (user × entity × action) với flag granted.
 * - granted = true  → escalate (thêm quyền role không có)
 * - granted = false → revoke (thu hồi quyền role có)
 * - expires_at = null → vĩnh viễn; > NOW() còn hiệu lực.
 */
export const userPermissionOverride = appSchema.table(
  "user_permission_override",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    entity: varchar("entity", { length: 50 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    granted: boolean("granted").notNull(),
    reason: text("reason"),
    grantedBy: uuid("granted_by").references(() => userAccount.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => ({
    userEntityActionUk: uniqueIndex("user_permission_override_uk").on(
      t.userId,
      t.entity,
      t.action,
    ),
    userIdx: index("user_permission_override_user_idx").on(t.userId),
  }),
);

export type UserAccount = typeof userAccount.$inferSelect;
export type NewUserAccount = typeof userAccount.$inferInsert;
export type Role = typeof role.$inferSelect;
export type Session = typeof session.$inferSelect;
export type UserPermissionOverride = typeof userPermissionOverride.$inferSelect;
export type NewUserPermissionOverride =
  typeof userPermissionOverride.$inferInsert;
