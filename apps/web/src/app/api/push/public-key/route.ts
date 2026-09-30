import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/push/public-key — khoá VAPID public để trình duyệt subscribe.
 * `configured=false` (thiếu khoá env) → UI ẩn nút "Bật thông báo" thay vì gọi
 * subscribe() rồi lỗi khó hiểu.
 */
export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  return NextResponse.json({
    data: {
      configured: Boolean(env.VAPID_PUBLIC_KEY),
      publicKey: env.VAPID_PUBLIC_KEY || null,
    },
  });
}
