/**
 * POST /api/admin/sessions/[id]/revoke — revoke 1 session.
 *
 * Ownership:
 *  - Admin: revoke bất kỳ session nào (RBAC session:delete).
 *  - User thường: chỉ được revoke session của chính mình.
 */

import { NextResponse, type NextRequest } from "next/server";
import { can } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  getSessionById,
  revokeSessionById,
} from "@/server/repos/sessions";
import { writeAudit } from "@/server/services/audit";
import { extractRequestMeta, jsonError } from "@/server/http";
import {
  forbidden,
  getSession,
  unauthorized,
} from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const s = await getSession(req);
  if (!s) return unauthorized();

  const target = await getSessionById(params.id);
  if (!target) {
    return jsonError("NOT_FOUND", "Phiên không tồn tại.", 404);
  }
  if (target.revokedAt) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  const isOwner = target.userId === s.userId;
  const isAdmin = can(s.roles, "delete", "session");
  if (!isOwner && !isAdmin) {
    return forbidden();
  }

  try {
    await revokeSessionById(params.id);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: s,
      action: "DELETE",
      objectType: "session",
      objectId: params.id,
      notes: isOwner
        ? "User revoke phiên của mình"
        : `Admin revoke phiên user ${target.userId}`,
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "revoke session failed");
    return jsonError("INTERNAL", "Lỗi revoke phiên.", 500);
  }
}
