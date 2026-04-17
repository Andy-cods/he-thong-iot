import { createDbClient, type DbClient } from "@iot/db/client";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __iotDb: { db: DbClient; sql: ReturnType<typeof createDbClient>["sql"] } | undefined;
}

/**
 * Singleton Postgres pool (max=15 cho app theo plan 9.6).
 * Dùng global để tránh tạo pool mới mỗi lần hot-reload ở dev.
 */
export const { db, sql } = (() => {
  if (!globalThis.__iotDb) {
    globalThis.__iotDb = createDbClient({
      url: env.DATABASE_URL,
      max: 15,
      idleTimeout: 30,
      connectTimeout: 10,
    });
  }
  return globalThis.__iotDb;
})();
