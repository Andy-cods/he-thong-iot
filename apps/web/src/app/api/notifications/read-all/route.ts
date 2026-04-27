import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { notification } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/read-all — đánh dấu tất cả direct notifications của
 * user hiện tại là đã đọc.
 */
export async function POST(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  try {
    const result = await db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notification.recipientUser, guard.session.userId),
          isNull(notification.readAt),
        ),
      )
      .returning({ id: notification.id });
    return NextResponse.json({ data: { marked: result.length } });
  } catch (e) {
    return jsonError(
      "NOTIF_MARK_ALL_FAILED",
      (e as Error).message ?? "Không đánh dấu được",
      500,
    );
  }
}
