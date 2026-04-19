import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { session, userAccount } from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * Session repo V1.4 — hỗ trợ UI quản lý phiên đăng nhập.
 *
 * Ghi chú (D2 plan): revoke có hiệu lực trong vòng tối đa
 * `JWT_ACCESS_TTL` giây vì không dùng Redis blacklist. Tức access token
 * đã phát vẫn còn hợp lệ tới khi hết TTL — chỉ refresh bị chặn.
 */

export interface SessionListRow {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  userAgent: string | null;
  ipAddress: string | null;
  issuedAt: Date;
  expiresAt: Date;
  lastSeenAt: Date | null;
  isCurrent: boolean;
}

/**
 * Danh sách phiên đang hoạt động của user.
 * Active = revokedAt IS NULL AND expiresAt > now().
 * `currentSessionId` (từ cookie) → đánh dấu `isCurrent`.
 */
export async function listUserActiveSessions(
  userId: string,
  currentSessionId: string | null,
): Promise<SessionListRow[]> {
  const rows = await db
    .select({
      id: session.id,
      userId: session.userId,
      username: userAccount.username,
      fullName: userAccount.fullName,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
    })
    .from(session)
    .innerJoin(userAccount, eq(userAccount.id, session.userId))
    .where(
      and(
        eq(session.userId, userId),
        isNull(session.revokedAt),
        gt(session.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(session.issuedAt));

  return rows.map((r) => ({
    ...r,
    isCurrent: currentSessionId !== null && r.id === currentSessionId,
  }));
}

/**
 * Admin scope — toàn bộ phiên đang active của mọi user.
 */
export async function listAllActiveSessions(): Promise<SessionListRow[]> {
  const rows = await db
    .select({
      id: session.id,
      userId: session.userId,
      username: userAccount.username,
      fullName: userAccount.fullName,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
    })
    .from(session)
    .innerJoin(userAccount, eq(userAccount.id, session.userId))
    .where(
      and(
        isNull(session.revokedAt),
        gt(session.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(session.issuedAt));

  return rows.map((r) => ({ ...r, isCurrent: false }));
}

/**
 * Revoke 1 session theo id. Trả về session đã revoke (hoặc null).
 */
export async function revokeSessionById(id: string) {
  const [row] = await db
    .update(session)
    .set({ revokedAt: new Date() })
    .where(and(eq(session.id, id), isNull(session.revokedAt)))
    .returning({ id: session.id, userId: session.userId });
  return row ?? null;
}

/**
 * Revoke tất cả session đang active của user, TRỪ sessionId truyền vào
 * (session hiện tại của user). Dùng cho "Đăng xuất mọi thiết bị khác".
 */
export async function revokeAllOtherSessions(
  userId: string,
  exceptSessionId: string | null,
): Promise<number> {
  const conditions = [
    eq(session.userId, userId),
    isNull(session.revokedAt),
  ];
  if (exceptSessionId) {
    conditions.push(ne(session.id, exceptSessionId));
  }
  const result = await db
    .update(session)
    .set({ revokedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: session.id });
  return result.length;
}

/**
 * Revoke toàn bộ session của user (dùng khi admin reset password).
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await db
    .update(session)
    .set({ revokedAt: new Date() })
    .where(and(eq(session.userId, userId), isNull(session.revokedAt)))
    .returning({ id: session.id });
  return result.length;
}

/**
 * Update lastSeenAt — gọi từ refresh endpoint.
 */
export async function touchSessionLastSeen(id: string) {
  await db
    .update(session)
    .set({ lastSeenAt: sql`now()` })
    .where(eq(session.id, id));
}

/**
 * Lấy session theo id — dùng để verify ownership (user chỉ revoke session
 * của chính mình, admin có thể revoke tất cả).
 */
export async function getSessionById(id: string) {
  const [row] = await db
    .select({
      id: session.id,
      userId: session.userId,
      revokedAt: session.revokedAt,
    })
    .from(session)
    .where(eq(session.id, id))
    .limit(1);
  return row ?? null;
}
