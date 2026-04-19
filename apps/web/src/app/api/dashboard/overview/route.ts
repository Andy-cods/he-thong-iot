import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { item, bomTemplate, supplier } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { getSession, unauthorized } from "@/server/session";
import { cacheGetJson, cacheSetJson } from "@/server/services/redis";
import {
  generateMockOrders,
  generateMockAlerts,
} from "@/lib/dashboard-mocks";
import type { OrderReadinessRow } from "@/components/domain/OrdersReadinessTable";
import type { DashboardAlert } from "@/components/domain/AlertsList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_KEY = "dashboard:overview:v1";
const CACHE_TTL_SECONDS = 60;

export interface DashboardOverviewPayload {
  activeItemsCount: number;
  bomTemplatesCount: number;
  suppliersCount: number;
  /** V1.2 sẽ cung cấp count tồn kho dưới min_stock_qty. */
  lowStockCount: number | null;
  recentOrdersMock: OrderReadinessRow[];
  recentAlertsMock: DashboardAlert[];
  /** Metadata để UI biết field nào còn là mock / placeholder. */
  placeholder: {
    lowStockCount: "V1.2";
    recentOrdersMock: "V1.1";
    recentAlertsMock: "V1.1";
  };
  cachedAt: string;
}

/** Format số đếm từ 1 row count(*)::int. */
async function countRows(
  fn: () => Promise<{ count: number }[]>,
): Promise<number> {
  const rows = await fn();
  return rows[0]?.count ?? 0;
}

/**
 * GET /api/dashboard/overview
 * Trả KPI tổng quan cho trang chủ. Cache Redis 60s để giảm tải 3 COUNT queries
 * khi nhiều user cùng mở dashboard. Bất kỳ user đã login cũng xem được.
 *
 * Response shape xem `DashboardOverviewPayload`.
 */
export async function GET(req: NextRequest) {
  // Dashboard aggregate cho mọi user đã login — không ràng theo entity cụ thể.
  const session = await getSession(req);
  if (!session) return unauthorized();

  // 1) Thử đọc cache trước.
  const cached = await cacheGetJson<DashboardOverviewPayload>(CACHE_KEY);
  if (cached) {
    return NextResponse.json({ data: cached, cached: true });
  }

  // 2) Cache miss → 3 COUNT song song. isActive = true + status ACTIVE
  try {
    const [activeItemsCount, bomTemplatesCount, suppliersCount] =
      await Promise.all([
        countRows(() =>
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(item)
            .where(eq(item.isActive, true)),
        ),
        countRows(() =>
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(bomTemplate)
            .where(eq(bomTemplate.status, "ACTIVE")),
        ),
        countRows(() =>
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(supplier)
            .where(eq(supplier.isActive, true)),
        ),
      ]);

    const payload: DashboardOverviewPayload = {
      activeItemsCount,
      bomTemplatesCount,
      suppliersCount,
      // V1.2: sẽ query item WHERE on_hand_qty < min_stock_qty (chưa có bảng stock).
      lowStockCount: null,
      recentOrdersMock: generateMockOrders(),
      recentAlertsMock: generateMockAlerts(),
      placeholder: {
        lowStockCount: "V1.2",
        recentOrdersMock: "V1.1",
        recentAlertsMock: "V1.1",
      },
      cachedAt: new Date().toISOString(),
    };

    // 3) Fire-and-forget set cache.
    void cacheSetJson(CACHE_KEY, payload, CACHE_TTL_SECONDS);

    return NextResponse.json({ data: payload, cached: false });
  } catch (err) {
    logger.error({ err }, "dashboard overview query failed");
    return jsonError("INTERNAL", "Không tải được tổng quan.", 500);
  }
}
