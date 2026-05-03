/**
 * V3.7.50 — Seed 6 production users theo phòng ban (mỗi người 1 password).
 *
 * Run từ apps/web:
 *   tsx scripts/seed-prod-users-v3.7.50.ts
 *
 * Hoặc qua Docker (production):
 *   docker compose exec app pnpm tsx scripts/seed-prod-users-v3.7.50.ts
 *
 * 6 users với password riêng (mustChangePassword=true → buộc đổi lần đầu login):
 *   - GIACONG-TIEN     → operator   (Tiến — Gia công)
 *   - GIACONG-CUONG    → operator   (Cường — Gia công)
 *   - THIETKE-DUC      → planner    (Đức — Thiết kế)
 *   - THIETKE-SON      → planner    (Sơn — Thiết kế)
 *   - KHO-HOA          → warehouse  (Hoa — Kho)
 *   - THUMUA-KETOAN    → purchaser  (Kế toán — Thu mua)
 *
 * Idempotent: skip nếu username đã tồn tại (re-run an toàn — chỉ ensure role link).
 */
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { role, userAccount, userRole } from "@iot/db/schema";

interface ProdUser {
  username: string;
  fullName: string;
  email: string;
  role: "planner" | "purchaser" | "warehouse" | "operator";
  password: string;
}

// Password mỗi người 1 khác — dạng <Tên>@<4-digit-random> để dễ phổ biến.
// Buộc đổi lần đầu login (mustChangePassword=true) — bảo mật.
const USERS: ProdUser[] = [
  {
    username: "GIACONG-TIEN",
    fullName: "Tiến — Bộ phận Gia công",
    email: "giacong.tien@songchau.local",
    role: "operator",
    password: "Tien@4729",
  },
  {
    username: "GIACONG-CUONG",
    fullName: "Cường — Bộ phận Gia công",
    email: "giacong.cuong@songchau.local",
    role: "operator",
    password: "Cuong@8351",
  },
  {
    username: "THIETKE-DUC",
    fullName: "Đức — Bộ phận Thiết kế",
    email: "thietke.duc@songchau.local",
    role: "planner",
    password: "Duc@2057",
  },
  {
    username: "THIETKE-SON",
    fullName: "Sơn — Bộ phận Thiết kế",
    email: "thietke.son@songchau.local",
    role: "planner",
    password: "Son@6184",
  },
  {
    username: "KHO-HOA",
    fullName: "Hoa — Bộ phận Kho",
    email: "kho.hoa@songchau.local",
    role: "warehouse",
    password: "Hoa@9023",
  },
  {
    username: "THUMUA-KETOAN",
    fullName: "Kế toán — Bộ phận Thu mua",
    email: "thumua.ketoan@songchau.local",
    role: "purchaser",
    password: "Ketoan@5476",
  },
];

async function main() {
  console.log("[seed] V3.7.50 — Seed 6 production users\n");

  const created: string[] = [];
  const skipped: string[] = [];

  for (const u of USERS) {
    const passwordHash = await hashPassword(u.password);

    const existing = await db
      .select({ id: userAccount.id })
      .from(userAccount)
      .where(eq(userAccount.username, u.username))
      .limit(1);

    if (existing.length > 0) {
      // Ensure role link (idempotent)
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
      console.log(`[seed] SKIP   ${u.username} — already exists (role link ensured)`);
      skipped.push(u.username);
      continue;
    }

    const [newUser] = await db
      .insert(userAccount)
      .values({
        username: u.username,
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        isActive: true,
        mustChangePassword: true,
      })
      .returning({ id: userAccount.id });

    if (!newUser) throw new Error(`Failed to insert ${u.username}`);

    const [roleRow] = await db
      .select({ id: role.id })
      .from(role)
      .where(eq(role.code, u.role))
      .limit(1);
    if (!roleRow) {
      console.error(`[seed] ERROR: role '${u.role}' không có trong app.role`);
      continue;
    }

    await db.insert(userRole).values({
      userId: newUser.id,
      roleId: roleRow.id,
    });

    console.log(`[seed] CREATE ${u.username} → ${u.role} · id=${newUser.id}`);
    created.push(u.username);
  }

  console.log(
    `\n[seed] DONE — created=${created.length}, skipped=${skipped.length}`,
  );
  console.log("\n========================================");
  console.log("  THÔNG TIN ĐĂNG NHẬP — Phổ biến cho user");
  console.log("========================================");
  for (const u of USERS) {
    console.log(`  ${u.username.padEnd(18)} / ${u.password.padEnd(14)} → ${u.role}`);
  }
  console.log("\n  Lần đầu login sẽ bị buộc đổi password (mustChangePassword=true).");
  console.log("========================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] FAILED:", err);
  process.exit(1);
});
