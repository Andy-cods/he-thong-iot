/**
 * Seed 4 role + 1 admin placeholder.
 * Chạy: pnpm db:seed (sau khi db:push).
 */
import { pathToFileURL } from "node:url";
import argon2 from "argon2";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client";
import { role, userAccount, userRole } from "./schema/auth";

/**
 * V4.2 audit S1 — chặn chạy nhầm `pnpm db:seed` nhắm production và reset mật
 * khẩu admin về giá trị công khai trong source code.
 *
 * Hàm THUẦN (không đọc DB) để test được độc lập — xem `seed.test.ts`.
 *
 * - Production + không có `ALLOW_PROD_SEED=1` → throw ngay (chặn chạy nhầm).
 * - Production (kể cả có `ALLOW_PROD_SEED=1`, ví dụ lần deploy đầu tiên) BẮT
 *   BUỘC phải có `SEED_ADMIN_PASSWORD` — không có mật khẩu mặc định nào lọt
 *   vào production.
 * - Ngoài production (dev/CI) → cho phép mật khẩu mặc định `ChangeMe!234` để
 *   tiện bootstrap local.
 */
export function assertSeedAllowed(env: {
  NODE_ENV: string | undefined;
  ALLOW_PROD_SEED: string | undefined;
  SEED_ADMIN_PASSWORD: string | undefined;
}): void {
  const isProd = env.NODE_ENV === "production";
  if (isProd && env.ALLOW_PROD_SEED !== "1") {
    throw new Error(
      "[seed] Chặn: NODE_ENV=production nhưng thiếu ALLOW_PROD_SEED=1. " +
        "Seed KHÔNG được chạy nhắm production trừ khi cố ý (set ALLOW_PROD_SEED=1 " +
        "+ SEED_ADMIN_PASSWORD).",
    );
  }
  if (isProd && !env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      "[seed] Chặn: production bắt buộc phải đặt SEED_ADMIN_PASSWORD — " +
        "không dùng mật khẩu mặc định trong source code.",
    );
  }
}

/** Mật khẩu admin dùng để seed — THUẦN, dùng chung với test. */
export function resolveSeedAdminPassword(env: {
  SEED_ADMIN_PASSWORD: string | undefined;
}): string {
  return env.SEED_ADMIN_PASSWORD ?? "ChangeMe!234";
}

async function main() {
  assertSeedAllowed({
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_PROD_SEED: process.env.ALLOW_PROD_SEED,
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
  });

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

  const adminPassword = resolveSeedAdminPassword({
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
  });
  console.log("[seed] Seeding admin user (tạo mới nếu chưa có; KHÔNG ghi đè mật khẩu tài khoản đã tồn tại)…");
  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  // V4.2 audit S1 — `onConflictDoNothing()` thay vì `onConflictDoUpdate`: nếu
  // user `admin` đã tồn tại (đã đổi mật khẩu thật), seed chạy lại KHÔNG được
  // ghi đè mật khẩu về giá trị trong source code/env này nữa.
  const insertedAdmin = await db
    .insert(userAccount)
    .values({
      username: "admin",
      email: "admin@iot.local",
      fullName: "Quản trị hệ thống",
      passwordHash,
      mfaEnabled: false,
      isActive: true,
    })
    .onConflictDoNothing({ target: userAccount.username })
    .returning({ id: userAccount.id });

  const wasCreated = !!insertedAdmin[0];
  let adminUser = insertedAdmin[0];
  if (!adminUser) {
    // Đã tồn tại từ trước — chỉ lấy id để gán role, không đụng passwordHash.
    const [existing] = await db
      .select({ id: userAccount.id })
      .from(userAccount)
      .where(sql`${userAccount.username} = 'admin'`);
    adminUser = existing;
    console.log("[seed] User admin đã tồn tại — giữ nguyên mật khẩu hiện tại.");
  }

  if (!adminUser) throw new Error("Admin user insert failed");

  await db
    .insert(userRole)
    .values({ userId: adminUser.id, roleId: adminRole.id })
    .onConflictDoNothing();

  console.log("[seed] Done.");
  console.log("        Username: admin");
  if (wasCreated) {
    console.log(`        Password: ${adminPassword}  (đổi ngay sau login lần đầu)`);
  } else {
    console.log("        Password: (giữ nguyên — không bị ghi đè)");
  }

  await raw.end({ timeout: 5 });
}

// Chỉ tự chạy khi gọi trực tiếp (`tsx src/seed.ts` / `pnpm db:seed`), KHÔNG
// khi file này được `import` (vd từ `seed.test.ts`) — tránh side-effect
// `process.exit()` làm nhiễu test runner.
const isMain = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error("[seed] FAIL:", err);
    process.exit(1);
  });
}
