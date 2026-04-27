import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { purchaseOrder, purchaseRequest, workOrder } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { getSession, unauthorized } from "@/server/session";
import { cacheGetJson, cacheSetJson } from "@/server/services/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/action-items — TASK-20260427-027.
 *
 * Aggregate 3 nhóm việc cần xử lý trên dashboard:
 *   - prDraft: Số PR status='DRAFT' đang chờ submit/duyệt.
 *   - poOverdue: PO chưa nhận đủ + expected_eta < now()
 *                (status NOT IN CLOSED/RECEIVED/CANCELLED).
 *   - woOverdue: WO IN_PROGRESS + planned_end < CURRENT_DATE.
 *
 * Cache Redis 30s. Auth: user đã login.
 *
 * Sample response:
 * {
 *   "cachedAt": "2026-04-27T12:34:56.789Z",
 *   "prDraft":   { "count": 3, "href": "/procurement/purchase-requests?status=DRAFT" },
 *   "poOverdue": { "count": 1, "href": "/procurement/purchase-orders?overdue=true" },
 *   "woOverdue": { "count": 0, "href": "/work-orders?overdue=true" }
 * }
 */

const CACHE_KEY = "dashboard:action-items:v1";
const CACHE_TTL_SECONDS = 30;

export interface DashboardActionItem {
  count: number;
  href: string;
}

export interface DashboardActionItemsPayload {
  cachedAt: string;
  prDraft: DashboardActionItem;
  poOverdue: DashboardActionItem;
  woOverdue: DashboardActionItem;
}

async function buildPayload(): Promise<DashboardActionItemsPayload> {
  const [prRows, poRows, woRows] = await Promise.all([
    db
      .select({
        count: sql<number>`COUNT(*) FILTER (WHERE ${purchaseRequest.status} = 'DRAFT')::int`,
      })
      .from(purchaseRequest),
    db
      .select({
        count: sql<number>`COUNT(*) FILTER (
          WHERE ${purchaseOrder.expectedEta} IS NOT NULL
            AND ${purchaseOrder.expectedEta} < CURRENT_DATE
            AND ${purchaseOrder.status} NOT IN ('CLOSED','RECEIVED','CANCELLED')
        )::int`,
      })
      .from(purchaseOrder),
    db
      .select({
        count: sql<number>`COUNT(*) FILTER (
          WHERE ${workOrder.status} = 'IN_PROGRESS'
            AND ${workOrder.plannedEnd} IS NOT NULL
            AND ${workOrder.plannedEnd} < CURRENT_DATE
        )::int`,
      })
      .from(workOrder),
  ]);

  return {
    cachedAt: new Date().toISOString(),
    prDraft: {
      count: prRows[0]?.count ?? 0,
      href: "/procurement/purchase-requests?status=DRAFT",
    },
    poOverdue: {
      count: poRows[0]?.count ?? 0,
      href: "/procurement/purchase-orders?overdue=true",
    },
    woOverdue: {
      count: woRows[0]?.count ?? 0,
      href: "/work-orders?overdue=true",
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();

    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    if (!fresh) {
      const cached =
        await cacheGetJson<DashboardActionItemsPayload>(CACHE_KEY);
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

    const payload = await buildPayload();
    await cacheSetJson(CACHE_KEY, payload, CACHE_TTL_SECONDS);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, s-maxage=30, stale-while-revalidate=60",
        "X-Cache": fresh ? "BYPASS" : "MISS",
      },
    });
  } catch (err) {
    logger.error({ err }, "dashboard action-items failed");
    return jsonError("INTERNAL", "Không tải được danh sách cần xử lý.", 500);
  }
}
