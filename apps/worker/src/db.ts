import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@iot/db/schema";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://hethong_app:pass@localhost:5432/hethong_iot";

const client = postgres(databaseUrl, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

// V3.11.4 (audit W.7) — export client để graceful shutdown đóng pool sạch.
export const pgClient = client;
export const db = drizzle(client, { schema });
export type Db = typeof db;
