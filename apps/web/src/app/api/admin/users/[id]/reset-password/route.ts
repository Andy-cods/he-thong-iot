/**
 * POST /api/admin/users/[id]/reset-password — admin reset password cho user.
 *
 * Flow:
 *  1. Guard requireCan("update", "user") — admin only theo matrix.
 *  2. Generate temp password 12 ký tự secure (mix case + số + special).
 *  3. argon2 hash + update user_account.password_hash.
 *  4. Set must_change_password = true, clear reset token cũ.
 *  5. Revoke all active sessions của user → force logout.
 *  6. Audit "UPDATE" trên user_account với notes "Admin reset password".
 *  7. Trả tempPassword về client (HIỆN 1 LẦN duy nhất; admin tự gửi user
 *     qua kênh an toàn như Telegram).
 */

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { userAccount } from "@iot/db/schema";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateTempPassword } from "@/lib/password-gen";
import { extractRequestMeta, jsonError } from "@/server/http";
import { revokeAllUserSessions } from "@/server/repos/sessions";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "user");
  if ("response" in guard) return guard.response;
  const actor = guard.session;

  // Chặn self-reset qua endpoint này (admin phải dùng change-password UI).
  if (params.id === actor.userId) {
    return jsonError(
      "SELF_RESET_DENIED",
      "Không thể tự reset mật khẩu chính mình. Dùng chức năng đổi mật khẩu.",
      400,
    );
  }

  try {
    const [target] = await db
      .select({
        id: userAccount.id,
        username: userAccount.username,
        isActive: userAccount.isActive,
      })
      .from(userAccount)
      .where(eq(userAccount.id, params.id))
      .limit(1);

    if (!target) {
      return jsonError("NOT_FOUND", "User không tồn tại.", 404);
    }

    const tempPassword = generateTempPassword(12);
    const hash = await hashPassword(tempPassword);

    await db
      .update(userAccount)
      .set({
        passwordHash: hash,
        mustChangePassword: true,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLoginCount: "0",
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(userAccount.id, target.id));

    // Revoke all session → force logout thiết bị cũ
    const revokedCount = await revokeAllUserSessions(target.id);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor,
      action: "UPDATE",
      objectType: "user_account",
      objectId: target.id,
      notes: `Admin reset password (force change on next login, revoked ${revokedCount} session)`,
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    logger.info(
      {
        actorUserId: actor.userId,
        targetUserId: target.id,
        targetUsername: target.username,
        revokedSessions: revokedCount,
      },
      "admin reset password",
    );

    return NextResponse.json({
      ok: true,
      tempPassword,
      username: target.username,
      revokedSessions: revokedCount,
    });
  } catch (err) {
    logger.error({ err }, "admin reset password failed");
    return jsonError("INTERNAL", "Lỗi reset mật khẩu.", 500);
  }
}
