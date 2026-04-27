import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { notification } from "@iot/db/schema";
import type { Role } from "@iot/shared";
import { db } from "@/lib/db";
import { jsonError } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notifications — list notifications cho session user.
 *
 * Query:
 *   - unread=1 → chỉ chưa đọc
 *   - limit (default 30, max 100)
 *   - cursor (timestamptz iso) — pagination by created_at
 *
 * Trả về: tất cả direct (recipient_user = me) + role broadcast (recipient_role
 * IN my roles). Sắp xếp DESC theo created_at.
 */
export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limitParam = Number(url.searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitParam)
    ? Math.min(100, Math.max(1, limitParam))
    : 30;
  const cursor = url.searchParams.get("cursor");

  const userId = guard.session.userId;
  const roles = guard.session.roles as Role[];

  try {
    const conds = [
      or(
        eq(notification.recipientUser, userId),
        roles.length > 0
          ? inArray(notification.recipientRole, roles)
          : sql`false`,
      ),
    ];
    if (unreadOnly) {
      conds.push(isNull(notification.readAt));
    }
    if (cursor) {
      conds.push(sql`${notification.createdAt} < ${cursor}`);
    }

    const rows = await db
      .select({
        id: notification.id,
        recipientUser: notification.recipientUser,
        recipientRole: notification.recipientRole,
        actorUserId: notification.actorUserId,
        actorUsername: notification.actorUsername,
        eventType: notification.eventType,
        entityType: notification.entityType,
        entityId: notification.entityId,
        entityCode: notification.entityCode,
        title: notification.title,
        message: notification.message,
        link: notification.link,
        severity: notification.severity,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      })
      .from(notification)
      .where(and(...conds))
      .orderBy(desc(notification.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1]!.createdAt.toISOString()
      : null;

    // Đếm unread (chỉ direct, không tính role broadcast cho badge)
    const [unreadRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notification)
      .where(
        and(
          eq(notification.recipientUser, userId),
          isNull(notification.readAt),
        ),
      );
    const unreadCount = unreadRow?.count ?? 0;

    return NextResponse.json({
      data: items.map((r) => ({
        ...r,
        // Đánh dấu xem có phải direct (đếm vào badge) hay role broadcast (không)
        isDirect: r.recipientUser === userId,
      })),
      meta: {
        hasMore,
        nextCursor,
        unreadCount,
      },
    });
  } catch (e) {
    return jsonError(
      "NOTIF_LIST_FAILED",
      (e as Error).message ?? "Không lấy được danh sách thông báo",
      500,
    );
  }
}
