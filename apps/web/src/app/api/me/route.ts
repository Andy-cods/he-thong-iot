import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { role, userAccount, userRole } from "@iot/db/schema/auth";
import type { AuthMeResponse, Role } from "@iot/shared";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, parseJson } from "@/server/http";
import { updateUser } from "@/server/repos/userAccounts";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Chưa đăng nhập." } },
      { status: 401 },
    );
  }

  const payload = await verifyAccessToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: { code: "INVALID_TOKEN", message: "Phiên đăng nhập hết hạn." } },
      { status: 401 },
    );
  }

  const [user] = await db
    .select({
      id: userAccount.id,
      username: userAccount.username,
      fullName: userAccount.fullName,
      email: userAccount.email,
    })
    .from(userAccount)
    .where(eq(userAccount.id, payload.sub))
    .limit(1);

  if (!user) {
    return NextResponse.json(
      { error: { code: "USER_NOT_FOUND", message: "Tài khoản không tồn tại." } },
      { status: 404 },
    );
  }

  const roles = await db
    .select({ code: role.code })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId))
    .where(eq(userRole.userId, user.id));

  const body: AuthMeResponse = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    roles: roles.map((r) => r.code) as Role[],
  };

  return NextResponse.json(body);
}

/**
 * V3.7.66 — PATCH /api/me — self-update profile (fullName, email).
 * Mọi user đã login đều update được thông tin của chính họ. KHÔNG đổi
 * username/role qua endpoint này (admin only qua /api/admin/users/[id]).
 */
const updateSchema = z.object({
  fullName: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().max(255).optional().nullable(),
});

export async function PATCH(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, updateSchema);
  if ("response" in body) return body.response;

  const patch: Parameters<typeof updateUser>[1] = {};
  if (body.data.fullName !== undefined) patch.fullName = body.data.fullName;
  if (body.data.email !== undefined) patch.email = body.data.email;

  if (Object.keys(patch).length === 0) {
    return jsonError("VALIDATION", "Không có trường nào để cập nhật.", 422);
  }

  try {
    const result = await updateUser(guard.session.userId, patch);
    if (!result) return jsonError("NOT_FOUND", "Tài khoản không tồn tại.", 404);

    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "user_account",
      objectId: guard.session.userId,
      after: { ...patch, self: true },
      notes: "Self-update profile",
    });

    return NextResponse.json({
      data: {
        id: result.id,
        username: result.username,
        fullName: result.fullName,
        email: result.email,
      },
    });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("EMAIL_CONFLICT") || msg.includes("duplicate")) {
      return jsonError("CONFLICT", "Email đã được dùng bởi tài khoản khác.", 409);
    }
    return jsonError("INTERNAL", "Không cập nhật được hồ sơ.", 500);
  }
}
