/**
 * Seed 4 role + 1 admin placeholder.
 * Chạy: pnpm db:seed (sau khi db:push).
 */
import argon2 from "argon2";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client";
import { role, userAccount, userRole } from "./schema/auth";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  const { db, sql: raw } = createDbClient({ url, max: 3 });

  console.log("[seed] Seeding roles…");
  const roles = [
    {
      code: "admin" as const,
      displayName: "Quản trị hệ thống",
      description: "Toàn quyền cấu hình, user, audit",
    },
    {
      code: "planner" as const,
      displayName: "Kế hoạch / BOM",
      description: "Tạo BOM, order, PO, snapshot",
    },
    {
      code: "warehouse" as const,
      displayName: "Thủ kho",
      description: "Nhận hàng, kiểm kho, điều chỉnh tồn",
    },
    {
      code: "operator" as const,
      displayName: "Công nhân xưởng",
      description: "Pick, scan, lắp ráp, báo tiến độ WO",
    },
  ];

  for (const r of roles) {
    await db
      .insert(role)
      .values(r)
      .onConflictDoUpdate({
        target: role.code,
        set: { displayName: r.displayName, description: r.description },
      });
  }

  const [adminRole] = await db
    .select()
    .from(role)
    .where(sql`${role.code} = 'admin'`);

  if (!adminRole) throw new Error("Admin role insert failed");

  console.log("[seed] Seeding admin user (admin / ChangeMe!234)…");
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!234";
  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const [adminUser] = await db
    .insert(userAccount)
    .values({
      username: "admin",
      email: "admin@iot.local",
      fullName: "Quản trị hệ thống",
      passwordHash,
      mfaEnabled: false,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: userAccount.username,
      set: { passwordHash, fullName: "Quản trị hệ thống", isActive: true },
    })
    .returning({ id: userAccount.id });

  if (!adminUser) throw new Error("Admin user insert failed");

  await db
    .insert(userRole)
    .values({ userId: adminUser.id, roleId: adminRole.id })
    .onConflictDoNothing();

  console.log("[seed] Done.");
  console.log("        Username: admin");
  console.log(`        Password: ${adminPassword}  (đổi ngay sau login lần đầu)`);

  await raw.end({ timeout: 5 });
}

main().catch((err) => {
  console.error("[seed] FAIL:", err);
  process.exit(1);
});
