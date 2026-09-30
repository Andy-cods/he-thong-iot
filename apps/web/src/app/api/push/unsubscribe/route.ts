import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { pushSubscription } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError, parseJson } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ endpoint: z.string().url().max(2000) });

/**
 * POST /api/push/unsubscribe — gỡ subscription của CHÍNH user đang đăng nhập
 * (scoped theo user_id — không cho gỡ subscription của người khác dù biết
 * endpoint).
 */
export async function POST(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bodySchema);
  if ("response" in body) return body.response;

  try {
    await db
      .delete(pushSubscription)
      .where(
        and(
          eq(pushSubscription.endpoint, body.data.endpoint),
          eq(pushSubscription.userId, guard.session.userId),
        ),
      );
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return jsonError(
      "PUSH_UNSUBSCRIBE_FAILED",
      (err as Error).message ?? "Không gỡ được subscription.",
      500,
    );
  }
}
