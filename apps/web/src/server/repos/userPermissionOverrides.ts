import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  userAccount,
  userPermissionOverride,
  type NewUserPermissionOverride,
  type UserPermissionOverride,
} from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * V1.9 P10 — repository cho `user_permission_override`.
 * Thuần read/write — logic merge với role nằm ở `services/rbac.ts::canForUser`.
 */

export interface OverrideRow {
  id: string;
  userId: string;
  entity: string;
  action: string;
  granted: boolean;
  reason: string | null;
  grantedBy: string | null;
  grantedByUsername: string | null;
  createdAt: Date;
  expiresAt: Date | null;
}

/** Lấy tất cả override còn hiệu lực của 1 user. */
export async function listActiveOverridesByUser(
  userId: string,
): Promise<OverrideRow[]> {
  const rows = await db
    .select({
      id: userPermissionOverride.id,
      userId: userPermissionOverride.userId,
      entity: userPermissionOverride.entity,
      action: userPermissionOverride.action,
      granted: userPermissionOverride.granted,
      reason: userPermissionOverride.reason,
      grantedBy: userPermissionOverride.grantedBy,
      grantedByUsername: userAccount.username,
      createdAt: userPermissionOverride.createdAt,
      expiresAt: userPermissionOverride.expiresAt,
    })
    .from(userPermissionOverride)
    .leftJoin(
      userAccount,
      eq(userAccount.id, userPermissionOverride.grantedBy),
    )
    .where(
      and(
        eq(userPermissionOverride.userId, userId),
        or(
          isNull(userPermissionOverride.expiresAt),
          gt(userPermissionOverride.expiresAt, sql`NOW()`),
        ),
      ),
    );
  return rows;
}

/** Lookup 1 override (user, entity, action) còn hiệu lực. */
export async function findActiveOverride(
  userId: string,
  entity: string,
  action: string,
): Promise<UserPermissionOverride | null> {
  const [row] = await db
    .select()
    .from(userPermissionOverride)
    .where(
      and(
        eq(userPermissionOverride.userId, userId),
        eq(userPermissionOverride.entity, entity),
        eq(userPermissionOverride.action, action),
        or(
          isNull(userPermissionOverride.expiresAt),
          gt(userPermissionOverride.expiresAt, sql`NOW()`),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Upsert override. Nếu (userId,entity,action) đã có → update granted/reason/expires.
 * Nếu chưa → insert.
 */
export async function upsertOverride(input: {
  userId: string;
  entity: string;
  action: string;
  granted: boolean;
  reason?: string | null;
  expiresAt?: Date | null;
  grantedBy: string | null;
}): Promise<UserPermissionOverride> {
  const values: NewUserPermissionOverride = {
    userId: input.userId,
    entity: input.entity,
    action: input.action,
    granted: input.granted,
    reason: input.reason ?? null,
    expiresAt: input.expiresAt ?? null,
    grantedBy: input.grantedBy,
  };

  const [row] = await db
    .insert(userPermissionOverride)
    .values(values)
    .onConflictDoUpdate({
      target: [
        userPermissionOverride.userId,
        userPermissionOverride.entity,
        userPermissionOverride.action,
      ],
      set: {
        granted: values.granted,
        reason: values.reason,
        expiresAt: values.expiresAt,
        grantedBy: values.grantedBy,
        createdAt: sql`NOW()`,
      },
    })
    .returning();
  if (!row) throw new Error("upsert override failed");
  return row;
}

/** Xoá hẳn override (về role-default). */
export async function deleteOverride(
  userId: string,
  entity: string,
  action: string,
): Promise<UserPermissionOverride | null> {
  const [row] = await db
    .delete(userPermissionOverride)
    .where(
      and(
        eq(userPermissionOverride.userId, userId),
        eq(userPermissionOverride.entity, entity),
        eq(userPermissionOverride.action, action),
      ),
    )
    .returning();
  return row ?? null;
}
