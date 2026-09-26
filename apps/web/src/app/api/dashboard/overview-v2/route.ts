import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { forbidden, getSession, isDisplayKiosk, unauthorized } from "@/server/session";
import { cacheGetJson, cacheSetJson } from "@/server/services/redis";
import {
  DASHBOARD_OVERVIEW_CACHE_KEY as CACHE_KEY,
  DASHBOARD_OVERVIEW_CACHE_TTL as CACHE_TTL_SECONDS,
  buildDashboardOverview as buildPayload,
  type DashboardOverviewV2Payload,
} from "@/server/services/dashboardOverview";

export type {
  DashboardOverviewV2Payload,
  ProgressMetric,
} from "@/server/services/dashboardOverview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dashboard Overview V2 — 6 progress bar tiến độ tổng quan + cachedAt.
 *
 * V4.1 Đợt 2 — SQL chuyển sang `server/services/dashboardOverview.ts` (dùng
 * chung với trang `/`); "Đặt mua"/"Nhận hàng" tính từ PO thật (xem service).
 *
 * Redis cache 30s. Auth: mọi user đã login (trừ kiosk display).
 */

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (isDisplayKiosk(session)) return forbidden(); // V3.11.4 (audit S.8)

    // ?fresh=1 → bypass cache (dùng cho nút Refresh manual).
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";

    if (!fresh) {
      const cached =
        await cacheGetJson<DashboardOverviewV2Payload>(CACHE_KEY);
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
    logger.error({ err }, "dashboard overview-v2 failed");
    return jsonError("INTERNAL", "Không tải được dữ liệu tổng quan.", 500);
  }
}
