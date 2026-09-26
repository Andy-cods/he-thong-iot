import { sql } from "drizzle-orm";
import { bomSnapshotLine, purchaseRequest, workOrder } from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * V4.1 Đợt 2 (Dashboard) — loader DUY NHẤT cho 6 thanh tiến độ Tổng quan, dùng
 * chung cho `app/(app)/page.tsx` (SSR) và `GET /api/dashboard/overview-v2`
 * (trước đây 2 bản SQL chép tay).
 *
 * Đổi nghĩa so với V3:
 *  - "Đặt mua"  = PO đã gửi NCC / PO không huỷ (trước: open_purchase_qty của
 *    snapshot đơn hàng bán — không phản ánh PO thật, đơn hàng bán đang ẩn).
 *  - "Nhận hàng" = dòng PO đã nhận ĐẠT đủ / dòng PO đã gửi NCC (trước:
 *    received_qty snapshot; cộng lẫn đơn vị).
 *  - Thẻ 1 giữ số dòng vật tư snapshot nhưng nhãn đúng "Linh kiện sẵn sàng".
 */

export const DASHBOARD_OVERVIEW_CACHE_KEY = "dashboard:overview-v2:v2";
export const DASHBOARD_OVERVIEW_CACHE_TTL = 30;

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

export function toMetric(num: number, den: number): ProgressMetric {
  const numerator = Number.isFinite(num) ? num : 0;
  const denominator = Number.isFinite(den) ? den : 0;
  const percent =
    denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
  return { numerator, denominator, percent };
}

async function queryPoMetrics(): Promise<{
  poSent: number;
  poTotal: number;
  linesReceived: number;
  linesTotal: number;
}> {
  const rows = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FILTER (WHERE status IN ('SENT','PARTIAL','RECEIVED','CLOSED'))
         FROM app.purchase_order WHERE status <> 'CANCELLED')::int AS po_sent,
      (SELECT COUNT(*) FROM app.purchase_order WHERE status <> 'CANCELLED')::int AS po_total,
      COUNT(*) FILTER (
        WHERE pol.received_qty - COALESCE(f.rejected, 0) >= pol.ordered_qty
      )::int AS lines_received,
      COUNT(*)::int AS lines_total
    FROM app.purchase_order_line pol
    JOIN app.purchase_order po ON po.id = pol.po_id
    LEFT JOIN (
      SELECT po_line_id, SUM(received_qty) AS rejected
      FROM app.inbound_receipt_line
      WHERE qc_status = 'FAIL'
      GROUP BY po_line_id
    ) f ON f.po_line_id = pol.id
    WHERE po.status IN ('SENT','PARTIAL','RECEIVED','CLOSED')
  `)) as unknown as Array<{
    po_sent: number;
    po_total: number;
    lines_received: number;
    lines_total: number;
  }>;
  const r = rows[0];
  return {
    poSent: Number(r?.po_sent ?? 0),
    poTotal: Number(r?.po_total ?? 0),
    linesReceived: Number(r?.lines_received ?? 0),
    linesTotal: Number(r?.lines_total ?? 0),
  };
}

export async function buildDashboardOverview(): Promise<DashboardOverviewV2Payload> {
  const [snapRows, woRows, prRows, po] = await Promise.all([
    db
      .select({
        totalLines: sql<number>`COUNT(*)::int`,
        availableLines: sql<number>`COUNT(*) FILTER (WHERE ${bomSnapshotLine.state} IN ('AVAILABLE','RESERVED','ISSUED','ASSEMBLED','CLOSED'))::int`,
        sumGross: sql<number>`COALESCE(SUM(${bomSnapshotLine.grossRequiredQty}), 0)::float8`,
        sumAssembled: sql<number>`COALESCE(SUM(${bomSnapshotLine.assembledQty}), 0)::float8`,
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
    queryPoMetrics(),
  ]);

  const s = snapRows[0];
  const w = woRows[0];
  const p = prRows[0];
  return {
    cachedAt: new Date().toISOString(),
    progress: {
      componentsAvailable: toMetric(s?.availableLines ?? 0, s?.totalLines ?? 0),
      assembly: toMetric(s?.sumAssembled ?? 0, s?.sumGross ?? 0),
      purchasing: toMetric(po.poSent, po.poTotal),
      receiving: toMetric(po.linesReceived, po.linesTotal),
      production: toMetric(w?.inProgress ?? 0, w?.totalActive ?? 0),
      purchaseRequests: toMetric(p?.done ?? 0, p?.total ?? 0),
    },
  };
}
