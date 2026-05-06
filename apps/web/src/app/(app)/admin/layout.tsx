import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { role, userRole } from "@iot/db/schema/auth";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * /admin/* layout — server-side role guard admin-only.
 *
 * Check JWT cookie → verify roles includes 'admin'. Nếu không → redirect /.
 * Parent (app)/layout.tsx đã check login, nên đây chỉ cần kiểm thêm role.
 * Theo R5 brainstorm — ngăn direct URL `/admin/*` từ non-admin user.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) redirect("/login");

  const payload = await verifyAccessToken(token);
  if (!payload) redirect("/login");

  const roles = await db
    .select({ code: role.code })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId))
    .where(eq(userRole.userId, payload.sub));

  const isAdmin = roles.some((r) => r.code === "admin");
  if (!isAdmin) redirect("/");

  // Layout chỉ làm role-guard. Mỗi page tự quyết định:
  //   - Page mới (V1.9+): dùng <AdminPageShell /> full-bleed (handle gradient + nav).
  //   - Page legacy (Phase 2 sẽ migrate): dùng container max-w-6xl riêng.
  // Để hỗ trợ cả hai, layout dùng full-width và để page tự bọc.
  return <div className="w-full">{children}</div>;
}
