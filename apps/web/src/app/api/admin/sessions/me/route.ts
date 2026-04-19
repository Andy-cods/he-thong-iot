/**
 * GET /api/admin/sessions/me — list sessions đang active của user hiện tại.
 *
 * Không cần RBAC entity `session` vì ai cũng phải xem được phiên của mình.
 * Chỉ yêu cầu đã login.
 */

import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { listUserActiveSessions } from "@/server/repos/sessions";
import { jsonError } from "@/server/http";
import { getSession, unauthorized } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return unauthorized();

  try {
    const sessions = await listUserActiveSessions(s.userId, s.sessionId);
    return NextResponse.json({
      data: sessions.map((row) => ({
        id: row.id,
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        issuedAt: row.issuedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
        isCurrent: row.isCurrent,
      })),
      meta: { total: sessions.length },
    });
  } catch (err) {
    logger.error({ err }, "list my sessions failed");
    return jsonError("INTERNAL", "Lỗi tải danh sách phiên.", 500);
  }
}
