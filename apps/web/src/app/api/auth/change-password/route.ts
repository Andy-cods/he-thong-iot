import { NextResponse, type NextRequest } from "next/server";
import { changePasswordSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { changePassword } from "@/server/repos/userAccounts";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  tooManyRequests,
} from "@/server/http";
import { changePasswordRateLimit } from "@/server/middlewares/rateLimit";
import { writeAudit } from "@/server/services/audit";
import { getSession, unauthorized } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Change-password self: mọi user đã login đều đổi được mật khẩu của chính mình.
  const session = await getSession(req);
  if (!session) return unauthorized();
  const guard = { session };

  // V1.4: rate limit per-user 3/60s chống spam đổi password.
  const rl = await changePasswordRateLimit(guard.session.userId);
  if (!rl.ok) {
    return tooManyRequests(rl.retryAfter);
  }

  const body = await parseJson(req, changePasswordSchema);
  if ("response" in body) return body.response;

  try {
    const result = await changePassword(
      guard.session.userId,
      body.data.currentPassword,
      body.data.newPassword,
    );
    if (!result.ok) {
      if (result.reason === "CURRENT_PASSWORD_INVALID") {
        return jsonError(
          "CURRENT_PASSWORD_INVALID",
          "Mật khẩu hiện tại không đúng.",
          401,
        );
      }
      return jsonError("INTERNAL", "Không đổi được mật khẩu.", 500);
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "user_account",
      objectId: guard.session.userId,
      notes: "change password (self)",
      ...meta,
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    logger.error({ err }, "change password failed");
    return jsonError("INTERNAL", "Không đổi được mật khẩu.", 500);
  }
}
