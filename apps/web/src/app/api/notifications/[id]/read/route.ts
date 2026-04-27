import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { notification } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/[id]/read — đánh dấu 1 notification là đã đọc.
 * Chỉ owner (recipient_user = me) mới có thể mark read.
 * Role broadcast notifications không thể mark read per-user (sẽ là feature
 * tương lai cần dùng bảng notification_read riêng).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const id = params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return jsonError("INVALID_ID", "ID không hợp lệ", 400);
  }

  try {
    const [row] = await db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notification.id, id),
          eq(notification.recipientUser, guard.session.userId),
          isNull(notification.readAt),
        ),
      )
      .returning({ id: notification.id });
    return NextResponse.json({ data: { id: row?.id ?? null, marked: !!row } });
  } catch (e) {
    return jsonError(
      "NOTIF_MARK_FAILED",
      (e as Error).message ?? "Không đánh dấu được thông báo",
      500,
    );
  }
}
