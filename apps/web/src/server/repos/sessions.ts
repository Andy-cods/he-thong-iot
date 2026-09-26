import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { session, userAccount } from "@iot/db/schema";
import { db } from "@/lib/db";
import { cacheDel, cacheGetJson, cacheSetJson } from "@/server/services/redis";
import { logger } from "@/lib/logger";

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
export async function listAllActiveSessions(
  currentSessionId: string | null = null,
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
        isNull(session.revokedAt),
        gt(session.expiresAt, new Date()),
      ),
    )
    // V4.1 AD-14 — sắp theo lần hoạt động gần nhất (last_seen cập nhật khi dùng).
    .orderBy(desc(sql`coalesce(${session.lastSeenAt}, ${session.issuedAt})`));

  return rows.map((r) => ({ ...r, isCurrent: r.id === currentSessionId }));
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
  if (row) await invalidateSessionValidCache(id);
  return row ?? null;
}

/* ─── V3.11.4 (audit S.3) — session-valid cache cho getSession ─────────────── */

const SESSION_VALID_TTL = 30; // giây — revoke có hiệu lực trong ≤30s
const sessionValidKey = (id: string) => `session-valid:${id}`;

/**
 * Kiểm tra 1 session (theo JWT sid) còn hợp lệ không: tồn tại + chưa revoke +
 * chưa hết hạn. Cache Redis 30s để không query DB mỗi request. Fail-open nếu
 * DB/Redis lỗi (trả true) — an toàn khả dụng hơn là khoá toàn hệ khi hạ tầng lỗi.
 */
export async function isSessionValid(sessionId: string): Promise<boolean> {
  const key = sessionValidKey(sessionId);
  try {
    const cached = await cacheGetJson<{ valid: boolean }>(key);
    if (cached) return cached.valid;
  } catch {
    /* cache miss/lỗi → xuống DB */
  }

  try {
    // V4.1 AD-09/AD-14 — kiểm tra hợp lệ ĐỒNG THỜI cập nhật last_seen_at (1 câu
    // UPDATE … RETURNING). Chỉ chạy khi cache 30s hết hạn → "Hoạt động lần cuối"
    // chính xác ~30s mà không thêm query mỗi request. Không trả dòng = phiên
    // không tồn tại / đã thu hồi / hết hạn.
    const [row] = await db
      .update(session)
      .set({ lastSeenAt: sql`now()` })
      .where(
        and(
          eq(session.id, sessionId),
          isNull(session.revokedAt),
          gt(session.expiresAt, sql`now()`),
        ),
      )
      .returning({ id: session.id });
    const valid = !!row;
    try {
      await cacheSetJson(key, { valid }, SESSION_VALID_TTL);
    } catch {
      /* bỏ qua lỗi cache set */
    }
    return valid;
  } catch (err) {
    // DB lỗi → fail-open (không khoá người dùng vì sự cố hạ tầng).
    logger.warn({ err, sessionId }, "isSessionValid DB lookup failed, fail-open");
    return true;
  }
}

async function invalidateSessionValidCache(id: string): Promise<void> {
  try {
    await cacheDel(sessionValidKey(id));
  } catch {
    /* cache sẽ tự hết hạn sau ≤30s */
  }
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
  // V3.11.4 (audit S.3) — xoá cache-valid các session vừa revoke để hiệu lực ngay.
  await Promise.all(result.map((r) => invalidateSessionValidCache(r.id)));
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
  await Promise.all(result.map((r) => invalidateSessionValidCache(r.id)));
  return result.length;
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
