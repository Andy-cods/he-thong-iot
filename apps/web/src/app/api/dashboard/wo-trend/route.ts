import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { workOrder } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { getSession, unauthorized } from "@/server/session";
import { cacheGetJson, cacheSetJson } from "@/server/services/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/wo-trend?days=7 — TASK-20260427-027.
 *
 * Trend Work Order COMPLETED 7 ngày gần nhất (timezone Asia/Ho_Chi_Minh).
 * Trả mảng `[{date: 'YYYY-MM-DD', count: N}, ...]` (bao gồm cả ngày 0 — đảm
 * bảo sparkline có đủ buckets).
 *
 * Cache Redis 5 phút (key `dashboard:wo-trend:v1:<days>`).
 *
 * Sample response:
 * {
 *   "cachedAt": "2026-04-27T12:34:56.789Z",
 *   "days": 7,
 *   "points": [
 *     { "date": "2026-04-21", "count": 0 },
 *     { "date": "2026-04-22", "count": 2 },
 *     ...
 *     { "date": "2026-04-27", "count": 1 }
 *   ]
 * }
 */

const CACHE_KEY_PREFIX = "dashboard:wo-trend:v1";
const CACHE_TTL_SECONDS = 300;
const TZ = "Asia/Ho_Chi_Minh";

export interface DashboardWoTrendPoint {
  date: string;
  count: number;
}

export interface DashboardWoTrendPayload {
  cachedAt: string;
  days: number;
  points: DashboardWoTrendPoint[];
}

async function buildPayload(days: number): Promise<DashboardWoTrendPayload> {
  // Generate full date series + LEFT JOIN aggregate (đảm bảo bucket đủ).
  const rows = (await db.execute(sql`
    WITH series AS (
      SELECT generate_series(
        (CURRENT_DATE AT TIME ZONE ${TZ})::date - (${days - 1}::int),
        (CURRENT_DATE AT TIME ZONE ${TZ})::date,
        '1 day'::interval
      )::date AS day
    ),
    agg AS (
      SELECT
        ((${workOrder.completedAt}) AT TIME ZONE ${TZ})::date AS day,
        COUNT(*)::int AS cnt
      FROM ${workOrder}
      WHERE ${workOrder.completedAt} IS NOT NULL
        AND ${workOrder.completedAt} >= (CURRENT_DATE - (${days}::int))
      GROUP BY 1
    )
    SELECT to_char(s.day, 'YYYY-MM-DD') AS date,
           COALESCE(a.cnt, 0)::int AS count
    FROM series s
    LEFT JOIN agg a ON a.day = s.day
    ORDER BY s.day ASC
  `)) as unknown as Array<{ date: string; count: number }>;

  return {
    cachedAt: new Date().toISOString(),
    days,
    points: rows.map((r) => ({
      date: String(r.date),
      count: Number(r.count) || 0,
    })),
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();

    const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? "7");
    const days = Number.isFinite(daysRaw)
      ? Math.min(30, Math.max(2, Math.floor(daysRaw)))
      : 7;
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const cacheKey = `${CACHE_KEY_PREFIX}:${days}`;

    if (!fresh) {
      const cached =
        await cacheGetJson<DashboardWoTrendPayload>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            "Cache-Control":
              "private, s-maxage=120, stale-while-revalidate=300",
            "X-Cache": "HIT",
          },
        });
      }
    }

    const payload = await buildPayload(days);
    await cacheSetJson(cacheKey, payload, CACHE_TTL_SECONDS);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, s-maxage=120, stale-while-revalidate=300",
        "X-Cache": fresh ? "BYPASS" : "MISS",
      },
    });
  } catch (err) {
    logger.error({ err }, "dashboard wo-trend failed");
    return jsonError("INTERNAL", "Không tải được trend lệnh sản xuất.", 500);
  }
}
