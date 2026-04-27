import { NextResponse, type NextRequest } from "next/server";
import { desc, sql } from "drizzle-orm";
import { auditEvent, userAccount } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { getSession, unauthorized } from "@/server/session";
import { cacheGetJson, cacheSetJson } from "@/server/services/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/activity — TASK-20260427-027.
 *
 * Trả 10 audit_event gần đây cho trang Tổng quan ("Hoạt động gần đây").
 *
 * Auth: bất kỳ user đã login.
 * Cache: Redis 30s (key `dashboard:activity:v1`).
 *
 * Sample response:
 * {
 *   "cachedAt": "2026-04-27T12:34:56.789Z",
 *   "items": [
 *     { "id": "...", "actor": "admin", "actorDisplay": "Admin",
 *       "action": "WO_START", "objectType": "work_order",
 *       "objectId": "...", "occurredAt": "2026-04-27T12:30:00Z",
 *       "notes": "Bắt đầu lệnh sản xuất WO-2026-001" }
 *   ]
 * }
 */

const CACHE_KEY = "dashboard:activity:v1";
const CACHE_TTL_SECONDS = 30;

export interface DashboardActivityItem {
  id: string;
  actor: string | null;
  actorDisplay: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  occurredAt: string;
  notes: string | null;
}

export interface DashboardActivityPayload {
  cachedAt: string;
  items: DashboardActivityItem[];
}

async function buildPayload(
  limit: number,
): Promise<DashboardActivityPayload> {
  const rows = await db
    .select({
      id: auditEvent.id,
      action: auditEvent.action,
      objectType: auditEvent.objectType,
      objectId: auditEvent.objectId,
      occurredAt: auditEvent.occurredAt,
      notes: auditEvent.notes,
      actorUsername: auditEvent.actorUsername,
      actorDisplay: userAccount.fullName,
    })
    .from(auditEvent)
    .leftJoin(userAccount, sql`${userAccount.id} = ${auditEvent.actorUserId}`)
    .orderBy(desc(auditEvent.occurredAt))
    .limit(limit);

  return {
    cachedAt: new Date().toISOString(),
    items: rows.map((r) => ({
      id: r.id,
      actor: r.actorUsername,
      actorDisplay: r.actorDisplay ?? r.actorUsername,
      action: r.action,
      objectType: r.objectType,
      objectId: r.objectId,
      occurredAt:
        r.occurredAt instanceof Date
          ? r.occurredAt.toISOString()
          : String(r.occurredAt),
      notes: r.notes,
    })),
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();

    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "10");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(50, Math.max(1, Math.floor(limitRaw)))
      : 10;
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const cacheKey = `${CACHE_KEY}:${limit}`;

    if (!fresh) {
      const cached =
        await cacheGetJson<DashboardActivityPayload>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            "Cache-Control":
              "private, s-maxage=30, stale-while-revalidate=60",
            "X-Cache": "HIT",
          },
        });
      }
    }

    const payload = await buildPayload(limit);
    await cacheSetJson(cacheKey, payload, CACHE_TTL_SECONDS);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, s-maxage=30, stale-while-revalidate=60",
        "X-Cache": fresh ? "BYPASS" : "MISS",
      },
    });
  } catch (err) {
    logger.error({ err }, "dashboard activity failed");
    return jsonError("INTERNAL", "Không tải được hoạt động gần đây.", 500);
  }
}
