/**
 * Apply SQL migration từ thư mục ./drizzle (production).
 * V1 team dev thường dùng `db:push` cho nhanh; `db:migrate` chỉ dùng production.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDbClient } from "./client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  const { db, sql } = createDbClient({ url, max: 2 });
  console.log("[migrate] Applying SQL migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] Done.");
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error("[migrate] FAIL:", err);
  process.exit(1);
});
