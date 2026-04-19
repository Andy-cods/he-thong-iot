/**
 * POST /api/admin/sessions/revoke-all-others — đăng xuất mọi thiết bị khác
 * (giữ lại session hiện tại).
 *
 * Không cần RBAC kiểm tra — user thao tác trên session chính mình.
 */

import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { revokeAllOtherSessions } from "@/server/repos/sessions";
import { writeAudit } from "@/server/services/audit";
import { extractRequestMeta, jsonError } from "@/server/http";
import { getSession, unauthorized } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return unauthorized();

  try {
    const count = await revokeAllOtherSessions(s.userId, s.sessionId);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: s,
      action: "DELETE",
      objectType: "session",
      objectId: null,
      notes: `Revoke ${count} phiên khác`,
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ ok: true, revoked: count });
  } catch (err) {
    logger.error({ err }, "revoke all others failed");
    return jsonError("INTERNAL", "Lỗi đăng xuất thiết bị khác.", 500);
  }
}
