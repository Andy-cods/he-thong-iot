/**
 * GET /api/admin/stats — Dashboard aggregate cho trang `/admin`.
 *
 * V1.8-batch5 — thay thế landing admin dạng link list bằng KPI + insights.
 *
 * RBAC: `read / session` (chỉ admin có quyền này, xem `@iot/shared/rbac/matrix`).
 *
 * Cache Redis 30s (fail-open nếu Redis down).
 * Hàm aggregate song song:
 *   - users count (active/total)
 *   - sessions: distinct user 24h + active now
 *   - audit: total 24h + by action + top 10 recent
 *   - rate-limits: hits 429 24h (đọc SortedSet ratelimit:* — sampling)
 *   - recent active sessions top 5
 *   - system health: DB ping + Redis ping + BullMQ queue depth + backup stub
 */

import { NextResponse, type NextRequest } from "next/server";
import { sql as drizzleSql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import {
  cacheGetJson,
  cacheSetJson,
  getCacheRedis,
} from "@/server/services/redis";
import { getItemImportQueue } from "@/server/services/importQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_KEY = "admin:stats:v1";
const CACHE_TTL_SECONDS = 30;

export interface AdminStatsPayload {
  users: { active: number; total: number };
  sessions: { last24h: number; activeNow: number };
  audit: {
    total24h: number;
    byAction: Array<{ action: string; count: number }>;
  };
  rateLimits: { hits24h: number };
  recentAuditEvents: Array<{
    id: string;
    at: string;
    actorUsername: string | null;
    action: string;
    entity: string;
    objectId: string | null;
  }>;
  recentActiveSessions: Array<{
    id: string;
    userId: string;
    username: string | null;
    fullName: string | null;
    ip: string | null;
    userAgent: string | null;
    issuedAt: string;
    lastSeenAt: string | null;
  }>;
  systemHealth: {
    db: "ok" | "slow" | "down";
    redis: "ok" | "down";
    queueDepth: number;
    lastBackup: string | null;
  };
  cachedAt: string;
}

/**
 * Đếm tổng hits 429 trong 24h qua bằng cách scan Redis keys `ratelimit:*`
 * (sliding window ZSET). Rough estimate: sum ZCARD từng key — không exact
 * nhưng đủ để UI show order-of-magnitude. Chỉ sample một lượng giới hạn.
 */
async function countRateLimitHits24h(): Promise<number> {
  try {
    const redis = getCacheRedis();
    const keys: string[] = [];
    let cursor = "0";
    let scans = 0;
    do {
      const [next, batch] = await redis.scan(
        cursor,
        "MATCH",
        "ratelimit:*",
        "COUNT",
        100,
      );
      cursor = next;
      keys.push(...batch);
      scans += 1;
      if (scans > 5 || keys.length > 500) break; // hard cap
    } while (cursor !== "0");

    if (keys.length === 0) return 0;

    const pipe = redis.pipeline();
    for (const k of keys) pipe.zcard(k);
    const results = await pipe.exec();
    if (!results) return 0;

    let total = 0;
    for (const [err, val] of results) {
      if (err) continue;
      total += Number(val ?? 0);
    }
    return total;
  } catch {
    return 0;
  }
}

async function pingRedis(): Promise<"ok" | "down"> {
  try {
    const redis = getCacheRedis();
    const res = await redis.ping();
    return res === "PONG" ? "ok" : "down";
  } catch {
    return "down";
  }
}

async function queueDepth(): Promise<number> {
  try {
    const q = getItemImportQueue();
    const counts = await q.getJobCounts("waiting", "active", "delayed");
    return (
      Number(counts.waiting ?? 0) +
      Number(counts.active ?? 0) +
      Number(counts.delayed ?? 0)
    );
  } catch {
    return 0;
  }
}

async function pingDb(): Promise<"ok" | "slow" | "down"> {
  const start = Date.now();
  try {
    await db.execute(drizzleSql`select 1`);
    const elapsed = Date.now() - start;
    if (elapsed > 500) return "slow";
    return "ok";
  } catch {
    return "down";
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "session");
  if ("response" in guard) return guard.response;

  const cached = await cacheGetJson<AdminStatsPayload>(CACHE_KEY);
  if (cached) {
    return NextResponse.json({ data: cached, cached: true });
  }

  try {
    const [
      usersRowsRaw,
      sessionsRowsRaw,
      auditTotalRowsRaw,
      auditByActionRowsRaw,
      recentAuditRowsRaw,
      recentSessionRowsRaw,
      rateLimitHits,
      redisStatus,
      qDepth,
      dbStatus,
    ] = await Promise.all([
      db.execute(drizzleSql`
        select
          count(*) filter (where is_active)::int as active,
          count(*)::int as total
        from app.user_account
      `),
      db.execute(drizzleSql`
        select
          count(distinct user_id) filter (where issued_at > now() - interval '24 hours')::int as "last24h",
          count(*) filter (where revoked_at is null and expires_at > now())::int as "activeNow"
        from app.session
      `),
      db.execute(drizzleSql`
        select count(*)::int as total
        from app.audit_event
        where occurred_at > now() - interval '24 hours'
      `),
      db.execute(drizzleSql`
        select action::text as action, count(*)::int as count
        from app.audit_event
        where occurred_at > now() - interval '24 hours'
        group by action
        order by count desc
      `),
      db.execute(drizzleSql`
        select id, occurred_at as at, actor_username, action::text as action,
               object_type, object_id
        from app.audit_event
        order by occurred_at desc
        limit 10
      `),
      db.execute(drizzleSql`
        select s.id, s.user_id, u.username, u.full_name,
               s.ip_address, s.user_agent, s.issued_at, s.last_seen_at
        from app.session s
        left join app.user_account u on u.id = s.user_id
        where s.revoked_at is null
          and s.expires_at > now()
        order by coalesce(s.last_seen_at, s.issued_at) desc
        limit 5
      `),
      countRateLimitHits24h(),
      pingRedis(),
      queueDepth(),
      pingDb(),
    ]);

    const usersRows = usersRowsRaw as unknown as Array<{
      active: number;
      total: number;
    }>;
    const sessionsRows = sessionsRowsRaw as unknown as Array<{
      last24h: number;
      activeNow: number;
    }>;
    const auditTotalRows = auditTotalRowsRaw as unknown as Array<{
      total: number;
    }>;
    const auditByActionRows = auditByActionRowsRaw as unknown as Array<{
      action: string;
      count: number;
    }>;
    const recentAuditRows = recentAuditRowsRaw as unknown as Array<{
      id: string;
      at: Date | string;
      actor_username: string | null;
      action: string;
      object_type: string;
      object_id: string | null;
    }>;
    const recentSessionRows = recentSessionRowsRaw as unknown as Array<{
      id: string;
      user_id: string;
      username: string | null;
      full_name: string | null;
      ip_address: string | null;
      user_agent: string | null;
      issued_at: Date | string;
      last_seen_at: Date | string | null;
    }>;

    const usersRow = usersRows[0] ?? { active: 0, total: 0 };
    const sessionsRow = sessionsRows[0] ?? { last24h: 0, activeNow: 0 };
    const auditTotal = auditTotalRows[0]?.total ?? 0;

    const payload: AdminStatsPayload = {
      users: {
        active: Number(usersRow.active ?? 0),
        total: Number(usersRow.total ?? 0),
      },
      sessions: {
        last24h: Number(sessionsRow.last24h ?? 0),
        activeNow: Number(sessionsRow.activeNow ?? 0),
      },
      audit: {
        total24h: Number(auditTotal),
        byAction: auditByActionRows.map((r) => ({
          action: r.action,
          count: Number(r.count ?? 0),
        })),
      },
      rateLimits: { hits24h: rateLimitHits },
      recentAuditEvents: recentAuditRows.map((r) => ({
        id: r.id,
        at: new Date(r.at).toISOString(),
        actorUsername: r.actor_username,
        action: r.action,
        entity: r.object_type,
        objectId: r.object_id,
      })),
      recentActiveSessions: recentSessionRows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        username: r.username,
        fullName: r.full_name,
        ip: r.ip_address,
        userAgent: r.user_agent,
        issuedAt: new Date(r.issued_at).toISOString(),
        lastSeenAt: r.last_seen_at
          ? new Date(r.last_seen_at).toISOString()
          : null,
      })),
      systemHealth: {
        db: dbStatus,
        redis: redisStatus,
        queueDepth: qDepth,
        lastBackup: null,
      },
      cachedAt: new Date().toISOString(),
    };

    void cacheSetJson(CACHE_KEY, payload, CACHE_TTL_SECONDS);
    return NextResponse.json({ data: payload, cached: false });
  } catch (err) {
    logger.error({ err }, "admin stats aggregate failed");
    return jsonError("INTERNAL", "Lỗi tải thống kê quản trị.", 500);
  }
}
