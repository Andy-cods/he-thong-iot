import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { role, userAccount, userRole } from "@iot/db/schema/auth";
import type { Role } from "@iot/shared";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/AppShell";

export const dynamic = "force-dynamic";

/** Path user bị must_change_password vẫn được truy cập (để đổi mật khẩu). */
const FORCE_CHANGE_EXEMPT = [
  "/admin/settings/force-change-password",
  "/logout",
];

/**
 * V3.3 — Route → required roles map (server-side guard).
 * Mỗi prefix path chỉ cho phép user có ít nhất 1 trong các roles này.
 * Admin bypass tất cả. User không thuộc → redirect về /.
 *
 * KHỚP với NAV_ITEMS roles trong nav-items.ts.
 */
const ROUTE_ROLE_GUARD: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/admin",        roles: ["admin"] },
  { prefix: "/warehouse",    roles: ["admin", "warehouse"] },
  { prefix: "/sales",        roles: ["admin", "purchaser"] },
  { prefix: "/engineering",  roles: ["admin", "planner"] },
  { prefix: "/operations",   roles: ["admin", "operator"] },
  // BOM workspace, WO, PR detail pages → cho engineer (planner) + admin
  { prefix: "/bom",          roles: ["admin", "planner"] },
  { prefix: "/work-orders",  roles: ["admin", "planner", "operator"] },
  { prefix: "/procurement",  roles: ["admin", "planner", "purchaser"] },
  // Receiving + assembly: chỉ kho/vận hành/admin
  { prefix: "/receiving",    roles: ["admin", "warehouse"] },
  { prefix: "/assembly",     roles: ["admin", "operator"] },
  // Material requests: planner tạo + warehouse fulfil
  { prefix: "/material-requests", roles: ["admin", "planner", "warehouse"] },
  // Notifications + items + orders: ai cũng xem được (read-only ở các path)
  // /notifications, /items, /orders, /, /pwa → không guard
];

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
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) redirect("/login");

  const payload = await verifyAccessToken(token);
  if (!payload) redirect("/login");

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

  if (!userRow) redirect("/login");

  // V1.4 — nếu admin đã reset password, user phải đổi trước khi dùng tiếp.
  // Middleware đã forward x-pathname header để RSC đọc được current path.
  const currentPath = headers().get("x-pathname") ?? "";
  if (
    userRow.mustChangePassword &&
    !FORCE_CHANGE_EXEMPT.some((p) => currentPath.startsWith(p))
  ) {
    redirect("/admin/settings/force-change-password");
  }

  const roles = await db
    .select({ code: role.code })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId))
    .where(eq(userRole.userId, userRow.id));

  const roleCodes = roles.map((r) => r.code) as Role[];

  // V3.3 — Route guard: chặn user truy cập trang ngoài bộ phận.
  // Admin bypass mọi guard.
  if (!roleCodes.includes("admin")) {
    for (const guard of ROUTE_ROLE_GUARD) {
      if (currentPath.startsWith(guard.prefix)) {
        const allowed = guard.roles.some((r) => roleCodes.includes(r));
        if (!allowed) {
          redirect("/?denied=1");
        }
        break;
      }
    }
  }

  return (
    <AppShell
      user={{
        id: userRow.id,
        username: userRow.username,
        fullName: userRow.fullName ?? undefined,
        role: roleCodes.join(","),
      }}
    >
      {children}
    </AppShell>
  );
}
