import { sql } from "drizzle-orm";
import {
  bomSnapshotLine,
  purchaseRequest,
  workOrder,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { cacheGetJson, cacheSetJson } from "@/server/services/redis";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import type { DashboardOverviewV2Payload } from "@/app/api/dashboard/overview-v2/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * V3 Landing page `/` — Trang Tổng quan thay redirect cũ.
 *
 * Server component: fetch initial data (cache Redis 30s) + render
 * `<DashboardClient>` (client). Nhờ initialData, user thấy số ngay khi
 * page load (không có flicker loading skeleton ở first paint).
 *
 * Performance:
 *   - Single SQL aggregate qua 3 query parallel (Promise.all).
 *   - Cache Redis 30s reuse với API route `/api/dashboard/overview-v2`.
 *   - Auth đã đảm bảo bởi `(app)/layout.tsx`.
 *
 * @see plans/redesign-v3/{ui-redesign.md §B,implementation-plan.md P1-S1-T2}
 */

const CACHE_KEY = "dashboard:overview-v2:v1";
const CACHE_TTL_SECONDS = 30;

interface ProgressMetric {
  numerator: number;
  denominator: number;
  percent: number;
}

function toMetric(num: number, den: number): ProgressMetric {
  const numerator = Number.isFinite(num) ? num : 0;
  const denominator = Number.isFinite(den) ? den : 0;
  const percent =
    denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
  return { numerator, denominator, percent };
}

async function loadOverviewServer(): Promise<{
  data: DashboardOverviewV2Payload | null;
  error: string | null;
}> {
  try {
    const cached =
      await cacheGetJson<DashboardOverviewV2Payload>(CACHE_KEY);
    if (cached) return { data: cached, error: null };

    const [snap, wo, pr] = await Promise.all([
      db
        .select({
          totalLines: sql<number>`COUNT(*)::int`,
          availableLines: sql<number>`COUNT(*) FILTER (WHERE ${bomSnapshotLine.state} IN ('AVAILABLE','RESERVED','ISSUED','ASSEMBLED','CLOSED'))::int`,
          sumGross: sql<number>`COALESCE(SUM(${bomSnapshotLine.grossRequiredQty}), 0)::float8`,
          sumAssembled: sql<number>`COALESCE(SUM(${bomSnapshotLine.assembledQty}), 0)::float8`,
          sumOpenPurchase: sql<number>`COALESCE(SUM(${bomSnapshotLine.openPurchaseQty}), 0)::float8`,
          sumReceived: sql<number>`COALESCE(SUM(${bomSnapshotLine.receivedQty}), 0)::float8`,
        })
        .from(bomSnapshotLine),
      db
        .select({
          inProgress: sql<number>`COUNT(*) FILTER (WHERE ${workOrder.status} = 'IN_PROGRESS')::int`,
          totalActive: sql<number>`COUNT(*) FILTER (WHERE ${workOrder.status} IN ('RELEASED','IN_PROGRESS','COMPLETED'))::int`,
        })
        .from(workOrder),
      db
        .select({
          done: sql<number>`COUNT(*) FILTER (WHERE ${purchaseRequest.status} IN ('APPROVED','CONVERTED'))::int`,
          total: sql<number>`COUNT(*)::int`,
        })
        .from(purchaseRequest),
    ]);

    const s = snap[0] ?? {
      totalLines: 0,
      availableLines: 0,
      sumGross: 0,
      sumAssembled: 0,
      sumOpenPurchase: 0,
      sumReceived: 0,
    };
    const w = wo[0] ?? { inProgress: 0, totalActive: 0 };
    const p = pr[0] ?? { done: 0, total: 0 };

    const payload: DashboardOverviewV2Payload = {
      cachedAt: new Date().toISOString(),
      progress: {
        componentsAvailable: toMetric(s.availableLines, s.totalLines),
        assembly: toMetric(s.sumAssembled, s.sumGross),
        purchasing: toMetric(s.sumOpenPurchase, s.sumGross),
        receiving: toMetric(s.sumReceived, s.sumGross),
        production: toMetric(w.inProgress, w.totalActive),
        purchaseRequests: toMetric(p.done, p.total),
      },
    };

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
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-6 lg:px-6">
      <DashboardClient initialData={data} initialError={error} />
    </div>
  );
}
