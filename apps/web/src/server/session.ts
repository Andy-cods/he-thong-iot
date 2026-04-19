import { NextResponse, type NextRequest } from "next/server";
import type {
  JwtPayload,
  RbacAction,
  RbacEntity,
  Role,
} from "@iot/shared";
import { can } from "@iot/shared";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { apiBurstRateLimit } from "./middlewares/rateLimit";
import { tooManyRequests } from "./http";

export interface Session {
  userId: string;
  username: string;
  roles: Role[];
  /** V1.4: session row id từ JWT sid. Null nếu JWT cũ (pre-V1.4). */
  sessionId: string | null;
}

export async function getSession(req: NextRequest): Promise<Session | null> {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = (await verifyAccessToken(token)) as JwtPayload | null;
  if (!payload) return null;
  return {
    userId: payload.sub,
    username: payload.usr,
    roles: payload.roles ?? [],
    sessionId: payload.sid ?? null,
  };
}

/** Response 401 chuẩn. */
export function unauthorized() {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập." } },
    { status: 401 },
  );
}

/** Response 403 chuẩn. */
export function forbidden() {
  return NextResponse.json(
    {
      error: {
        code: "FORBIDDEN",
        message: "Bạn không có quyền thực hiện thao tác này.",
      },
    },
    { status: 403 },
  );
}

export function hasRole(session: Session, ...anyOf: Role[]): boolean {
  if (session.roles.includes("admin")) return true;
  return anyOf.some((r) => session.roles.includes(r));
}

/**
 * Helper guard dùng đầu mỗi route handler.
 *
 * @deprecated V1.4 — dùng `requireCan(req, action, entity)` để match
 *   RBAC matrix (`@iot/shared/rbac`). Giữ tạm cho backward-compat các
 *   route cũ; mỗi route nên được refactor dần sang `requireCan`.
 */
export async function requireSession(
  req: NextRequest,
  ...roles: Role[]
): Promise<{ session: Session } | { response: NextResponse }> {
  const burst = await apiBurstRateLimit(req);
  if (!burst.ok) return { response: tooManyRequests(burst.retryAfter) };

  const session = await getSession(req);
  if (!session) return { response: unauthorized() };
  if (roles.length > 0 && !hasRole(session, ...roles)) {
    return { response: forbidden() };
  }
  return { session };
}

/**
 * Guard chuẩn V1.4 — kiểm tra session + RBAC matrix (`can()`).
 *
 * Cũng apply rate limit burst 60 req/60s per-IP ngay đầu pipeline để
 * bảo vệ toàn bộ API authenticated. Rate limit fail-open khi Redis down.
 *
 * @example
 *   const r = await requireCan(req, "create", "item");
 *   if ("response" in r) return r.response;
 *   const session = r.session; // typed Session
 */
export async function requireCan(
  req: NextRequest,
  action: RbacAction,
  entity: RbacEntity,
): Promise<{ session: Session } | { response: NextResponse }> {
  const burst = await apiBurstRateLimit(req);
  if (!burst.ok) return { response: tooManyRequests(burst.retryAfter) };

  const session = await getSession(req);
  if (!session) return { response: unauthorized() };
  if (!can(session.roles, action, entity)) {
    return { response: forbidden() };
  }
  return { session };
}
