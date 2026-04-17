import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { role, userAccount, userRole } from "@iot/db/schema";
import type { Role } from "@iot/shared";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

export interface UserListQuery {
  q?: string;
  role?: Role;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

export interface UserListRow {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: Role[];
}

export async function listUsers(q: UserListQuery) {
  const where: SQL[] = [];

  if (q.q && q.q.trim().length > 0) {
    const needle = q.q.trim();
    where.push(
      sql`(
        ${userAccount.username} ILIKE ('%' || ${needle} || '%')
        OR public.f_unaccent(${userAccount.fullName})
           ILIKE public.f_unaccent('%' || ${needle} || '%')
        OR ${userAccount.email} ILIKE ('%' || ${needle} || '%')
      )`,
    );
  }
  if (q.isActive !== undefined) {
    where.push(eq(userAccount.isActive, q.isActive));
  }
  // role filter: sub-select userId với role code
  if (q.role) {
    where.push(sql`EXISTS (
      SELECT 1 FROM app.user_role ur
      INNER JOIN app.role r ON r.id = ur.role_id
      WHERE ur.user_id = ${userAccount.id} AND r.code = ${q.role}
    )`);
  }

  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const offset = (q.page - 1) * q.pageSize;

  const [totalResult, users] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(userAccount)
      .where(whereExpr ?? sql`true`),
    db
      .select({
        id: userAccount.id,
        username: userAccount.username,
        fullName: userAccount.fullName,
        email: userAccount.email,
        isActive: userAccount.isActive,
        lastLoginAt: userAccount.lastLoginAt,
        createdAt: userAccount.createdAt,
      })
      .from(userAccount)
      .where(whereExpr ?? sql`true`)
      .orderBy(desc(userAccount.createdAt))
      .limit(q.pageSize)
      .offset(offset),
  ]);

  // Load roles mass cho page này
  const userIds = users.map((u) => u.id);
  let roleMap = new Map<string, Role[]>();
  if (userIds.length > 0) {
    const rolePairs = await db
      .select({
        userId: userRole.userId,
        code: role.code,
      })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(inArray(userRole.userId, userIds));

    roleMap = rolePairs.reduce((acc, r) => {
      const arr = acc.get(r.userId) ?? [];
      arr.push(r.code as Role);
      acc.set(r.userId, arr);
      return acc;
    }, new Map<string, Role[]>());
  }

  const rows: UserListRow[] = users.map((u) => ({
    ...u,
    roles: roleMap.get(u.id) ?? [],
  }));
  return { rows, total: totalResult[0]?.count ?? 0 };
}

export async function getUserById(id: string) {
  const [row] = await db
    .select({
      id: userAccount.id,
      username: userAccount.username,
      fullName: userAccount.fullName,
      email: userAccount.email,
      isActive: userAccount.isActive,
      lastLoginAt: userAccount.lastLoginAt,
      createdAt: userAccount.createdAt,
      updatedAt: userAccount.updatedAt,
    })
    .from(userAccount)
    .where(eq(userAccount.id, id))
    .limit(1);
  if (!row) return null;

  const roles = await db
    .select({ code: role.code })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId))
    .where(eq(userRole.userId, id));

  return { ...row, roles: roles.map((r) => r.code as Role) };
}

export interface UserCreateInput {
  username: string;
  fullName: string;
  email?: string | null;
  password: string;
  roles: Role[];
}

export async function createUser(input: UserCreateInput, actorId: string | null) {
  const hash = await hashPassword(input.password);

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(userAccount)
      .values({
        username: input.username,
        fullName: input.fullName,
        email: input.email ?? null,
        passwordHash: hash,
        isActive: true,
      })
      .returning();
    if (!row) throw new Error("Không tạo được user");

    if (input.roles.length > 0) {
      const roleRows = await tx
        .select({ id: role.id, code: role.code })
        .from(role)
        .where(
          inArray(
            role.code,
            input.roles as unknown as (typeof role.code.enumValues)[number][],
          ),
        );

      for (const r of roleRows) {
        await tx.insert(userRole).values({
          userId: row.id,
          roleId: r.id,
          assignedBy: actorId,
        });
      }
    }

    return row;
  });
}

export interface UserUpdateInput {
  fullName?: string;
  email?: string | null;
  isActive?: boolean;
  roles?: Role[];
}

export async function updateUser(id: string, patch: UserUpdateInput) {
  return await db.transaction(async (tx) => {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.fullName !== undefined) values.fullName = patch.fullName;
    if (patch.email !== undefined) values.email = patch.email;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;

    let updated: typeof userAccount.$inferSelect | null = null;
    if (Object.keys(values).length > 1) {
      const [row] = await tx
        .update(userAccount)
        .set(values)
        .where(eq(userAccount.id, id))
        .returning();
      updated = row ?? null;
    } else {
      const [row] = await tx
        .select()
        .from(userAccount)
        .where(eq(userAccount.id, id))
        .limit(1);
      updated = row ?? null;
    }
    if (!updated) return null;

    if (patch.roles !== undefined) {
      await tx.delete(userRole).where(eq(userRole.userId, id));
      if (patch.roles.length > 0) {
        const roleRows = await tx
          .select({ id: role.id, code: role.code })
          .from(role)
          .where(
            inArray(
              role.code,
              patch.roles as unknown as (typeof role.code.enumValues)[number][],
            ),
          );
        for (const r of roleRows) {
          await tx.insert(userRole).values({ userId: id, roleId: r.id });
        }
      }
    }

    return updated;
  });
}

export async function deactivateUser(id: string) {
  const [row] = await db
    .update(userAccount)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(userAccount.id, id))
    .returning();
  return row ?? null;
}

export async function checkUsernameAvailable(
  username: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: userAccount.id })
    .from(userAccount)
    .where(eq(userAccount.username, username))
    .limit(1);
  return !row;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; reason?: string }> {
  const [row] = await db
    .select({ passwordHash: userAccount.passwordHash })
    .from(userAccount)
    .where(eq(userAccount.id, userId))
    .limit(1);
  if (!row) return { ok: false, reason: "USER_NOT_FOUND" };

  const verified = await verifyPassword(currentPassword, row.passwordHash);
  if (!verified) return { ok: false, reason: "CURRENT_PASSWORD_INVALID" };

  const newHash = await hashPassword(newPassword);
  await db
    .update(userAccount)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(userAccount.id, userId));
  return { ok: true };
}

export async function resetPassword(userId: string, newPassword: string) {
  const hash = await hashPassword(newPassword);
  const [row] = await db
    .update(userAccount)
    .set({ passwordHash: hash, updatedAt: new Date() })
    .where(eq(userAccount.id, userId))
    .returning({ id: userAccount.id });
  return row ?? null;
}
