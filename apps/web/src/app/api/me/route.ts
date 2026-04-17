import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { role, userAccount, userRole } from "@iot/db/schema/auth";
import type { AuthMeResponse, Role } from "@iot/shared";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { db } from "@/lib/db";

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
