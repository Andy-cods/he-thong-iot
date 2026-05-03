/**
 * V3.7.50 — HARD RESET business data (giữ schema, roles, admin).
 *
 * ⚠️ DESTRUCTIVE — KHÔNG THỂ UNDO. Chỉ chạy 1 lần khi user explicit confirm.
 *
 * Truncate TOÀN BỘ bảng business trong schema `app` ngoại trừ:
 *   - user_account (giữ admin only)
 *   - role
 *   - user_role (giữ admin's role assignments)
 *   - session (giữ admin's session để không bị log-out)
 *   - __drizzle_migrations / drizzle migration tracking
 *
 * Run từ apps/web (sau khi deploy):
 *   docker compose exec app pnpm tsx scripts/reset-business-data-v3.7.50.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

const PRESERVE_TABLES = [
  "user_account",
  "role",
  "user_role",
  "session",
  "user_permission_override",
];

async function main() {
  console.log("[reset] V3.7.50 — HARD RESET business data\n");
  console.log("[reset] Preserved tables: " + PRESERVE_TABLES.join(", "));
  console.log("[reset] Removing all non-admin users + all business records.\n");

  // 1. List candidate tables in schema 'app' (BASE TABLEs only)
  const candidateRows = (await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'app' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)) as unknown as Array<{ table_name: string }>;

  const truncateTargets = candidateRows
    .map((r) => r.table_name)
    .filter((name) => !PRESERVE_TABLES.includes(name));

  console.log(
    `[reset] Found ${candidateRows.length} tables, will TRUNCATE ${truncateTargets.length}:`,
  );
  for (const t of truncateTargets) console.log(`  - app.${t}`);
  console.log();

  // 2. Delete non-admin users + their roles (cascade clears their sessions too)
  const deletedUsers = (await db.execute(sql`
    DELETE FROM app.user_account WHERE username <> 'admin' RETURNING id, username
  `)) as unknown as Array<{ id: string; username: string }>;
  console.log(
    `[reset] Deleted ${deletedUsers.length} non-admin user accounts (cascade → user_role + session).`,
  );

  // 3. TRUNCATE all business tables in one statement (atomic) with CASCADE
  if (truncateTargets.length > 0) {
    const list = truncateTargets.map((t) => `app."${t}"`).join(", ");
    await db.execute(
      sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`),
    );
    console.log(`[reset] TRUNCATE OK — ${truncateTargets.length} tables.`);
  }

  // 4. Verify counts
  const adminCount = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM app.user_account WHERE username = 'admin'
  `)) as unknown as Array<{ n: number }>;
  console.log(`\n[reset] admin account preserved: ${adminCount[0]?.n ?? 0} row`);

  const itemCount = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM app.item
  `)) as unknown as Array<{ n: number }>;
  console.log(`[reset] app.item count: ${itemCount[0]?.n ?? "?"}`);

  console.log("\n[reset] DONE — production database reset complete.");
  console.log("[reset] Next: chạy seed-prod-users-v3.7.50.ts để tạo 6 user mới.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[reset] FAILED:", err);
  process.exit(1);
});
