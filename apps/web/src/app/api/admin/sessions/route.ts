/**
 * V4.1 AD-14 — GET /api/admin/sessions — admin xem MỌI phiên còn hiệu lực
 * (chưa thu hồi, chưa hết hạn) của mọi người dùng, sắp theo lần hoạt động gần
 * nhất. Thu hồi 1 phiên: POST /api/admin/sessions/[id]/revoke (admin có
 * `delete:session`).
 *
 * RBAC: `delete:session` — chỉ admin (matrix). Dùng quyền thu hồi làm cổng vì
 * trang này để quản lý (xem + thu hồi), không phải chỉ xem.
 */

import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { listAllActiveSessions } from "@/server/repos/sessions";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "delete", "session");
  if ("response" in guard) return guard.response;

  try {
    const rows = await listAllActiveSessions(guard.session.sessionId);
    return NextResponse.json({
      data: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        username: row.username,
        fullName: row.fullName,
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        issuedAt: row.issuedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
        isCurrent: row.isCurrent,
      })),
      meta: { total: rows.length },
    });
  } catch (err) {
    logger.error({ err }, "list all sessions failed");
    return jsonError("INTERNAL", "Lỗi tải danh sách phiên.", 500);
  }
}
