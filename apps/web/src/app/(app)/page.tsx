import { logger } from "@/lib/logger";
import { cacheGetJson, cacheSetJson } from "@/server/services/redis";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { ProductionBoardWidget } from "@/components/production-board/ProductionBoardWidget";
import {
  DASHBOARD_OVERVIEW_CACHE_KEY as CACHE_KEY,
  DASHBOARD_OVERVIEW_CACHE_TTL as CACHE_TTL_SECONDS,
  buildDashboardOverview,
  type DashboardOverviewV2Payload,
} from "@/server/services/dashboardOverview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * V3 Landing page `/` — Trang Tổng quan thay redirect cũ.
 *
 * Server component: fetch initial data (cache Redis 30s) + render
 * `<DashboardClient>` (client). Nhờ initialData, user thấy số ngay khi
 * page load (không có flicker loading skeleton ở first paint).
 *
 * V4.1 Đợt 2 — dùng chung loader `buildDashboardOverview` với API
 * `/api/dashboard/overview-v2` (trước đây chép SQL 2 nơi).
 * Auth đã đảm bảo bởi `(app)/layout.tsx`.
 */

async function loadOverviewServer(): Promise<{
  data: DashboardOverviewV2Payload | null;
  error: string | null;
}> {
  try {
    const cached =
      await cacheGetJson<DashboardOverviewV2Payload>(CACHE_KEY);
    if (cached) return { data: cached, error: null };

    const payload = await buildDashboardOverview();
    await cacheSetJson(CACHE_KEY, payload, CACHE_TTL_SECONDS);
    return { data: payload, error: null };
  } catch (err) {
    logger.error({ err }, "dashboard initial load failed");
    return {
      data: null,
      error: "Không tải được dữ liệu tổng quan. Đang thử lại…",
    };
  }
}

export default async function DashboardLandingPage() {
  const { data, error } = await loadOverviewServer();

  return (
    <div className="relative mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 lg:px-6">
      <DashboardClient initialData={data} initialError={error} />
      <ProductionBoardWidget />
    </div>
  );
}
