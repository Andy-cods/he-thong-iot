import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export interface CreateDbClientOptions {
  url: string;
  /** Kích cỡ pool. App=15, Worker=5. */
  max?: number;
  /** Idle timeout (seconds). */
  idleTimeout?: number;
  /** Connect timeout (seconds). */
  connectTimeout?: number;
}

export function createDbClient(opts: CreateDbClientOptions) {
  const sql = postgres(opts.url, {
    max: opts.max ?? 15,
    idle_timeout: opts.idleTimeout ?? 30,
    connect_timeout: opts.connectTimeout ?? 10,
    prepare: true,
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export type DbClient = ReturnType<typeof createDbClient>["db"];
