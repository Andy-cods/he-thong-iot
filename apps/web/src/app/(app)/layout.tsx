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
