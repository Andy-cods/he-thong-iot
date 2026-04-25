import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import {
  bomSnapshotLine,
  purchaseRequest,
  workOrder,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { getSession, unauthorized } from "@/server/session";
import { cacheGetJson, cacheSetJson } from "@/server/services/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dashboard Overview V2 — 6 progress bar tiến độ tổng quan + cachedAt.
 *
 * 6 progress bar (theo plans/redesign-v3/brainstorm.md §1 + §4):
 *   1. Linh kiện sẵn sàng = snapshot lines state IN (AVAILABLE, RESERVED,
 *      ISSUED, ASSEMBLED, CLOSED) / total active.
 *   2. Lắp ráp = sum(assembled_qty) / sum(gross_required_qty).
 *   3. Đặt mua = sum(open_purchase_qty) / sum(gross_required_qty).
 *   4. Nhận hàng = sum(received_qty) / sum(gross_required_qty).
 *   5. Sản xuất nội bộ = WO status IN_PROGRESS / WO RELEASED+IN_PROGRESS+COMPLETED.
 *   6. PR / Báo giá = PR APPROVED + CONVERTED / total PR.
 *
 * **Performance:**
 *   - Redis cache TTL 30s (key `dashboard:overview-v2:v1`).
 *   - Single SQL aggregate cho mỗi nhóm (snapshot / WO / PR) với
 *     `COUNT(*) FILTER (WHERE …)` thay vì 6 query riêng.
 *   - Parallel `Promise.all` cho 3 nhóm.
 *   - HTTP cache `s-maxage=30, stale-while-revalidate=60`.
 *
 * Auth: bất kỳ user đã login đều xem được (KHÔNG kiểm role để mọi bộ phận thấy
 * tổng quan). Nếu sau cần ẩn KPI nhạy cảm theo role → filter ở UI layer.
 */

const CACHE_KEY = "dashboard:overview-v2:v1";
const CACHE_TTL_SECONDS = 30;

export interface ProgressMetric {
  /** Tử số (đã hoàn thành / đã có data). */
  numerator: number;
  /** Mẫu số (mục tiêu / tổng cần). */
  denominator: number;
  /** % = numerator/denominator * 100, làm tròn 1 chữ số. 0 nếu denominator=0. */
  percent: number;
}

export interface DashboardOverviewV2Payload {
  cachedAt: string;
  progress: {
    componentsAvailable: ProgressMetric;
    assembly: ProgressMetric;
    purchasing: ProgressMetric;
    receiving: ProgressMetric;
    production: ProgressMetric;
    purchaseRequests: ProgressMetric;
  };
}

function toMetric(num: number, den: number): ProgressMetric {
  const numerator = Number.isFinite(num) ? num : 0;
  const denominator = Number.isFinite(den) ? den : 0;
  const percent =
    denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
  return { numerator, denominator, percent };
}

/**
 * 1 query duy nhất aggregate snapshot — tách 4 metric trong cùng 1 row.
 * Index dùng: bom_snapshot_line_state_idx (xem migration 0005e_indexes_mv.sql).
 */
async function querySnapshotMetrics(): Promise<{
  totalLines: number;
  availableLines: number;
  sumGross: number;
  sumAssembled: number;
  sumOpenPurchase: number;
  sumReceived: number;
}> {
  const rows = await db
    .select({
      totalLines: sql<number>`COUNT(*)::int`,
      availableLines: sql<number>`COUNT(*) FILTER (WHERE ${bomSnapshotLine.state} IN ('AVAILABLE','RESERVED','ISSUED','ASSEMBLED','CLOSED'))::int`,
      sumGross: sql<number>`COALESCE(SUM(${bomSnapshotLine.grossRequiredQty}), 0)::float8`,
      sumAssembled: sql<number>`COALESCE(SUM(${bomSnapshotLine.assembledQty}), 0)::float8`,
      sumOpenPurchase: sql<number>`COALESCE(SUM(${bomSnapshotLine.openPurchaseQty}), 0)::float8`,
      sumReceived: sql<number>`COALESCE(SUM(${bomSnapshotLine.receivedQty}), 0)::float8`,
    })
    .from(bomSnapshotLine);

  const r = rows[0];
  return {
    totalLines: r?.totalLines ?? 0,
    availableLines: r?.availableLines ?? 0,
    sumGross: r?.sumGross ?? 0,
    sumAssembled: r?.sumAssembled ?? 0,
    sumOpenPurchase: r?.sumOpenPurchase ?? 0,
    sumReceived: r?.sumReceived ?? 0,
  };
}

/**
 * WO metrics — single aggregate. Dùng index work_order_status_idx.
 */
async function queryWoMetrics(): Promise<{
  inProgress: number;
  totalActive: number;
}> {
  const rows = await db
    .select({
      inProgress: sql<number>`COUNT(*) FILTER (WHERE ${workOrder.status} = 'IN_PROGRESS')::int`,
      totalActive: sql<number>`COUNT(*) FILTER (WHERE ${workOrder.status} IN ('RELEASED','IN_PROGRESS','COMPLETED'))::int`,
    })
    .from(workOrder);

  const r = rows[0];
  return {
    inProgress: r?.inProgress ?? 0,
    totalActive: r?.totalActive ?? 0,
  };
}

/**
 * PR metrics — single aggregate. Dùng index pr_status_idx.
 */
async function queryPrMetrics(): Promise<{
  done: number;
  total: number;
}> {
  const rows = await db
    .select({
      done: sql<number>`COUNT(*) FILTER (WHERE ${purchaseRequest.status} IN ('APPROVED','CONVERTED'))::int`,
      total: sql<number>`COUNT(*)::int`,
    })
    .from(purchaseRequest);

  const r = rows[0];
  return {
    done: r?.done ?? 0,
    total: r?.total ?? 0,
  };
}

async function buildPayload(): Promise<DashboardOverviewV2Payload> {
  const [snap, wo, pr] = await Promise.all([
    querySnapshotMetrics(),
    queryWoMetrics(),
    queryPrMetrics(),
  ]);

  return {
    cachedAt: new Date().toISOString(),
    progress: {
      componentsAvailable: toMetric(snap.availableLines, snap.totalLines),
      assembly: toMetric(snap.sumAssembled, snap.sumGross),
      purchasing: toMetric(snap.sumOpenPurchase, snap.sumGross),
      receiving: toMetric(snap.sumReceived, snap.sumGross),
      production: toMetric(wo.inProgress, wo.totalActive),
      purchaseRequests: toMetric(pr.done, pr.total),
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();

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
