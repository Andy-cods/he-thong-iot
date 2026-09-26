import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { role, userAccount, userRole } from "@iot/db/schema/auth";
import type { Role } from "@iot/shared";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/AppShell";
import { SessionExpiryGuard } from "@/components/auth/SessionExpiryGuard";
import { isSessionValid } from "@/server/repos/sessions";
import { listActiveOverridesByUser } from "@/server/repos/userPermissionOverrides";
import { isRouteAllowed } from "@/lib/route-guard";
import type { PermissionOverrideLite } from "@/lib/permissions";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Path user bị must_change_password vẫn được truy cập (để đổi mật khẩu). */
// V4.1 AD-01: trang đổi MK bắt buộc chuyển từ /admin/... sang /me/change-password
// (dưới /admin thì user không phải admin bị admin layout đá về "/" → kẹt vòng).
const FORCE_CHANGE_PATH = "/me/change-password";
const FORCE_CHANGE_EXEMPT = [FORCE_CHANGE_PATH, "/logout"];

// V4.1 AD-17/AD-19 — bảng guard theo route chuyển sang lib/route-guard.ts
// (dùng chung với menu + Ctrl+K, có áp override quyền riêng từng user).

/**
 * Direction B — `(app)` layout.
 *
 * - Server component: auth check + fetch user profile + roles.
 * - Render AppShell (client) với user đã verify.
 * - Sidebar/TopBar/Breadcrumb logic đã gom trong AppShell.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // V4.1 AD-18 — về /login kèm `next` = đường dẫn + query hiện tại để đăng nhập
  // lại xong quay về đúng trang, không mất dữ liệu điền sẵn trên URL.
  const currentPath = headers().get("x-pathname") ?? "";
  const currentSearch = headers().get("x-search") ?? "";
  const loginUrl = currentPath
    ? `/login?next=${encodeURIComponent(currentPath + currentSearch)}`
    : "/login";

  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) redirect(loginUrl);

  const payload = await verifyAccessToken(token);
  if (!payload) redirect(loginUrl);

  // V4.1 AD-04: phiên bị thu hồi (admin khoá / đổi vai trò) thì trang cũng phải
  // chặn, không chỉ API. isSessionValid có cache 30s nên rẻ.
  if (payload.sid && !(await isSessionValid(payload.sid))) redirect(loginUrl);

  // Hydrate fullName + roles từ DB để sidebar/topbar hiển thị đúng.
  // Query này chạy mỗi navigation trong (app)/* — acceptable vì cache plan có
  // thể thêm sau; tạm thời mỗi request 1 query (~2-5 ms Postgres indexed).
  const [userRow] = await db
    .select({
      id: userAccount.id,
      username: userAccount.username,
      fullName: userAccount.fullName,
      mustChangePassword: userAccount.mustChangePassword,
    })
    .from(userAccount)
    .where(eq(userAccount.id, payload.sub))
    .limit(1);

  if (!userRow) redirect(loginUrl);

  // V1.4 — nếu admin đã reset password, user phải đổi trước khi dùng tiếp.
  // Middleware đã forward x-pathname header để RSC đọc được current path.
  if (
    userRow.mustChangePassword &&
    !FORCE_CHANGE_EXEMPT.some((p) => currentPath.startsWith(p))
  ) {
    redirect(FORCE_CHANGE_PATH);
  }

  const roles = await db
    .select({ code: role.code })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId))
    .where(eq(userRole.userId, userRow.id));

  const roleCodes = roles.map((r) => r.code) as Role[];

  // V3.8.2 — Tài khoản kiosk TV (role "display", không phải admin) CHỈ được
  // xem /board (ngoài (app) group). Mọi truy cập vào (app)/* → đẩy ra /board.
  if (roleCodes.includes("display") && !roleCodes.includes("admin")) {
    redirect("/board");
  }

  // V4.1 AD-19 — override quyền riêng từng user (còn hiệu lực) áp cho cả menu +
  // chặn trang, cùng quy tắc với API (DENY thắng). Lỗi DB → bỏ qua override
  // (giống requireCan: fallback theo vai trò).
  let overrides: PermissionOverrideLite[] = [];
  if (!roleCodes.includes("admin")) {
    try {
      overrides = (await listActiveOverridesByUser(userRow.id)).map((o) => ({
        entity: o.entity,
        action: o.action,
        granted: o.granted,
      }));
    } catch (err) {
      logger.warn({ err, userId: userRow.id }, "layout: load overrides failed");
    }
  }

  // V3.3 — Route guard: chặn user truy cập trang ngoài bộ phận. Admin bypass.
  if (!isRouteAllowed(currentPath, roleCodes, overrides)) {
    redirect("/?denied=1");
  }

  return (
    <AppShell
      user={{
        id: userRow.id,
        username: userRow.username,
        fullName: userRow.fullName ?? undefined,
        role: roleCodes.join(","),
      }}
      permissionOverrides={overrides}
    >
      <SessionExpiryGuard expiresAt={payload.exp ? payload.exp * 1000 : null} />
      {children}
    </AppShell>
  );
}
