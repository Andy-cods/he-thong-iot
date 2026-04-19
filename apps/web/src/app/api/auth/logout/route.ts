import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { revokeSessionById } from "@/server/repos/sessions";
import { getSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Best-effort revoke session row (V1.4). Không fail nếu session không có
  // sid (JWT cũ trước V1.4) hoặc DB lỗi.
  try {
    const s = await getSession(req);
    if (s?.sessionId) {
      await revokeSessionById(s.sessionId);
    }
  } catch (err) {
    logger.warn({ err }, "logout: revoke session row failed");
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
