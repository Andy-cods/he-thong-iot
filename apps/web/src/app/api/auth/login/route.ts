import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { role, session, userAccount, userRole } from "@iot/db/schema/auth";
import type { Role } from "@iot/shared";
import {
  AUTH_COOKIE_NAME,
  cookieOptions,
  signAccessToken,
  verifyPassword,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { extractRequestMeta } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: "Dữ liệu đăng nhập không hợp lệ.",
        },
      },
      { status: 400 },
    );
  }

  const { username, password } = parsed.data;

  const [user] = await db
    .select({
      id: userAccount.id,
      username: userAccount.username,
      passwordHash: userAccount.passwordHash,
      isActive: userAccount.isActive,
      lockedUntil: userAccount.lockedUntil,
      fullName: userAccount.fullName,
    })
    .from(userAccount)
    .where(eq(userAccount.username, username))
    .limit(1);

  const invalid = NextResponse.json(
    {
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Tên đăng nhập hoặc mật khẩu không đúng.",
      },
    },
    { status: 401 },
  );

  if (!user || !user.isActive) {
    // Verify vẫn chạy để tránh timing attack — dùng hash giả
    await verifyPassword(
      password,
      "$argon2id$v=19$m=19456,t=2,p=1$YWFhYWFhYWFhYWFhYWFhYQ$dummyhashdummyhashdummyhashdummy",
    );
    return invalid;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return NextResponse.json(
      {
        error: {
          code: "ACCOUNT_LOCKED",
          message: "Tài khoản đang bị khoá tạm thời. Vui lòng thử lại sau.",
        },
      },
      { status: 423 },
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await db
      .update(userAccount)
      .set({
        failedLoginCount: sql`(CAST(${userAccount.failedLoginCount} AS INTEGER) + 1)::text`,
      })
      .where(eq(userAccount.id, user.id));
    return invalid;
  }

  // Load roles
  const roles = await db
    .select({ code: role.code })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId))
    .where(eq(userRole.userId, user.id));

  const roleCodes = roles.map((r) => r.code) as Role[];

  // V1.4: tạo session row để hỗ trợ revoke + list active sessions.
  // refresh_token_hash tạm dùng random 32 bytes (chưa phát refresh token
  // thật — V1.4 giữ JWT-only, chỉ cần unique value để NOT NULL). V1.5+
  // sẽ chuyển sang refresh token thật.
  const meta = extractRequestMeta(req);
  const refreshTokenHash = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.JWT_ACCESS_TTL * 1000);
  const [sessionRow] = await db
    .insert(session)
    .values({
      userId: user.id,
      refreshTokenHash,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      issuedAt: now,
      expiresAt,
      lastSeenAt: now,
    })
    .returning({ id: session.id });

  const token = await signAccessToken({
    sub: user.id,
    username: user.username,
    roles: roleCodes,
    sid: sessionRow?.id,
  });

  await db
    .update(userAccount)
    .set({
      lastLoginAt: new Date(),
      failedLoginCount: "0",
    })
    .where(eq(userAccount.id, user.id));

  logger.info(
    { userId: user.id, username: user.username, roles: roleCodes },
    "user login",
  );

  const res = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roles: roleCodes,
    },
  });

  res.cookies.set(AUTH_COOKIE_NAME, token, cookieOptions(env.JWT_ACCESS_TTL));

  return res;
}
