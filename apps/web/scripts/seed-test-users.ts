/**
 * V3.3 — Seed 4 test users theo phòng ban.
 *
 * Run từ apps/web:
 *   tsx scripts/seed-test-users.ts
 *
 * Hoặc thông qua Docker:
 *   docker compose exec app pnpm tsx scripts/seed-test-users.ts
 *
 * Tạo 4 users với password chung "Test@1234":
 *   - bo.phan.thiet.ke   → role planner   (Bộ phận Thiết kế)
 *   - bo.phan.thu.mua    → role purchaser (Bộ phận Thu mua)
 *   - bo.phan.kho        → role warehouse (Bộ phận Kho)
 *   - bo.phan.van.hanh   → role operator  (Bộ phận Vận hành)
 *
 * Idempotent: skip nếu username đã tồn tại.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { role, userAccount, userRole } from "@iot/db/schema";

const TEST_USERS: Array<{
  username: string;
  fullName: string;
  email: string;
  role: "planner" | "purchaser" | "warehouse" | "operator";
}> = [
  {
    username: "bo.phan.thiet.ke",
    fullName: "Bộ phận Thiết kế",
    email: "thietke@songchau.local",
    role: "planner",
  },
  {
    username: "bo.phan.thu.mua",
    fullName: "Bộ phận Thu mua",
    email: "thumua@songchau.local",
    role: "purchaser",
  },
  {
    username: "bo.phan.kho",
    fullName: "Bộ phận Kho",
    email: "kho@songchau.local",
    role: "warehouse",
  },
  {
    username: "bo.phan.van.hanh",
    fullName: "Bộ phận Vận hành",
    email: "vanhanh@songchau.local",
    role: "operator",
  },
];

async function main() {
  const password = "Test@1234";
  const passwordHash = await hashPassword(password);

  console.log("[seed] Hashed password ready");

  for (const u of TEST_USERS) {
    // Check existing
    const existing = await db
      .select({ id: userAccount.id })
      .from(userAccount)
      .where(eq(userAccount.username, u.username))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[seed] SKIP ${u.username} — already exists`);
      // Still ensure role link
      const [roleRow] = await db
        .select({ id: role.id })
        .from(role)
        .where(eq(role.code, u.role))
        .limit(1);
      if (roleRow) {
        await db
          .insert(userRole)
          .values({ userId: existing[0]!.id, roleId: roleRow.id })
          .onConflictDoNothing();
      }
      continue;
    }

    // Create user
    const [newUser] = await db
      .insert(userAccount)
      .values({
        username: u.username,
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      })
      .returning({ id: userAccount.id });

    if (!newUser) throw new Error(`Failed to insert ${u.username}`);

    // Get role id
    const [roleRow] = await db
      .select({ id: role.id })
      .from(role)
      .where(eq(role.code, u.role))
      .limit(1);

    if (!roleRow) {
      console.error(`[seed] ERROR: role ${u.role} not found in app.role table`);
      continue;
    }

    // Link user to role
    await db.insert(userRole).values({
      userId: newUser.id,
      roleId: roleRow.id,
    });

    console.log(`[seed] OK    ${u.username} (${u.role}) — id=${newUser.id}`);
  }

  console.log("\n[seed] DONE — 4 test users:");
  for (const u of TEST_USERS) {
    console.log(`  • ${u.username} / Test@1234 → ${u.fullName} (${u.role})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] FAILED:", err);
  process.exit(1);
});
