import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { pushSubscription } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError, parseJson } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

/**
 * POST /api/push/subscribe — lưu/subscription Web Push cho CHÍNH user đang
 * đăng nhập. `endpoint` unique toàn hệ thống (1 trình duyệt/thiết bị = 1
 * endpoint) — subscribe lại từ thiết bị cũ (đổi user, đổi máy khác dùng
 * chung) cập nhật user_id thay vì tạo dòng trùng.
 */
export async function POST(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bodySchema);
  if ("response" in body) return body.response;

  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;

  try {
    const [existing] = await db
      .select({ id: pushSubscription.id })
      .from(pushSubscription)
      .where(eq(pushSubscription.endpoint, body.data.endpoint))
      .limit(1);

    if (existing) {
      await db
        .update(pushSubscription)
        .set({
          userId: guard.session.userId,
          p256dh: body.data.keys.p256dh,
          auth: body.data.keys.auth,
          userAgent,
          lastSeenAt: new Date(),
        })
        .where(eq(pushSubscription.id, existing.id));
    } else {
      await db.insert(pushSubscription).values({
        userId: guard.session.userId,
        endpoint: body.data.endpoint,
        p256dh: body.data.keys.p256dh,
        auth: body.data.keys.auth,
        userAgent,
      });
    }
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return jsonError(
      "PUSH_SUBSCRIBE_FAILED",
      (err as Error).message ?? "Không lưu được subscription.",
      500,
    );
  }
}
