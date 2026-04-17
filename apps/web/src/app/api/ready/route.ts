import { sql as rawSql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReadyCheck {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

async function checkDb(): Promise<ReadyCheck> {
  const start = Date.now();
  try {
    await sql`select 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function checkRedis(): Promise<ReadyCheck> {
  // Redis chỉ dùng ở worker V1; web không import ioredis để giảm RAM/size.
  // Placeholder check URL format, expand khi thật sự cần.
  if (!env.REDIS_URL) return { ok: false, error: "REDIS_URL missing" };
  try {
    new URL(env.REDIS_URL);
    return { ok: true };
  } catch {
    return { ok: false, error: "REDIS_URL invalid" };
  }
}

async function checkR2(): Promise<ReadyCheck> {
  if (!env.R2.endpoint || !env.R2.bucket) {
    return { ok: false, error: "R2 config missing" };
  }
  // TODO: HEAD bucket khi tuần 2+ có R2 client; V1 chỉ check env.
  return { ok: true };
}

export async function GET() {
  const [dbChk, redisChk, r2Chk] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkR2(),
  ]);

  const ready = dbChk.ok && redisChk.ok && r2Chk.ok;

  return NextResponse.json(
    {
      ready,
      ts: new Date().toISOString(),
      checks: {
        db: dbChk,
        redis: redisChk,
        r2: r2Chk,
      },
    },
    { status: ready ? 200 : 503 },
  );
}
