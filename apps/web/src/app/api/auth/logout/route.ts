import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { revokeSessionById } from "@/server/repos/sessions";
import { getSession } from "@/server/session";
import { extractRequestMeta } from "@/server/http";
import { writeAudit } from "@/server/services/audit";

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
    // V4.1 AD-10 — nhật ký đăng xuất.
    if (s) {
      const meta = extractRequestMeta(req);
      await writeAudit({
        actor: s,
        action: "LOGOUT",
        objectType: "session",
        objectId: s.sessionId,
        notes: "Đăng xuất",
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
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
