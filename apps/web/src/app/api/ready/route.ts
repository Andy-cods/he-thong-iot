import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { getCacheRedis } from "@/server/services/redis";

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
  // V3.11.4 (audit S.6) — PING thật (trước đây chỉ parse URL, không phát hiện
  // Redis chết). Web nay có dùng Redis (rate-limit + session cache) nên readiness
  // phản ánh đúng trạng thái Redis.
  if (!env.REDIS_URL) return { ok: false, error: "REDIS_URL missing" };
  const start = Date.now();
  try {
    const pong = await getCacheRedis().ping();
    if (pong !== "PONG") return { ok: false, error: `unexpected: ${pong}` };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function GET() {
  const [dbChk, redisChk] = await Promise.all([checkDb(), checkRedis()]);

  // R2 là config chưa dùng (không có S3 client) → KHÔNG tính vào readiness.
  const ready = dbChk.ok && redisChk.ok;

  return NextResponse.json(
    {
      ready,
      ts: new Date().toISOString(),
      checks: {
        db: dbChk,
        redis: redisChk,
      },
    },
    { status: ready ? 200 : 503 },
  );
}
