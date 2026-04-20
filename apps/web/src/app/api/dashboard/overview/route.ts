import { NextResponse, type NextRequest } from "next/server";
import { desc, eq, inArray, sql, sum } from "drizzle-orm";
import { item, bomTemplate, supplier, salesOrder, bomSnapshotLine, workOrder } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { getSession, unauthorized } from "@/server/session";
import { cacheGetJson, cacheSetJson } from "@/server/services/redis";
import {
  generateMockAlerts,
} from "@/lib/dashboard-mocks";
import type { OrderReadinessRow } from "@/components/domain/OrdersReadinessTable";
import type { DashboardAlert } from "@/components/domain/AlertsList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_KEY = "dashboard:overview:v2";
const CACHE_TTL_SECONDS = 60;

export interface DashboardOverviewPayload {
  activeItemsCount: number;
  bomTemplatesCount: number;
  suppliersCount: number;
  /** V1.2 sẽ cung cấp count tồn kho dưới min_stock_qty. */
  lowStockCount: number | null;
  /** WO đang IN_PROGRESS (real). */
  woRunningCount: number;
  recentOrders: OrderReadinessRow[];
  recentAlertsMock: DashboardAlert[];
  /** Metadata để UI biết field nào còn là mock / placeholder. */
  placeholder: {
    lowStockCount: "V1.2";
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
 * Map sales_order.status → OrderReadinessRow.status (BadgeStatus).
 */
function mapOrderStatus(
  status: string,
): OrderReadinessRow["status"] {
  switch (status) {
    case "CONFIRMED":
      return "info";
    case "SNAPSHOTTED":
      return "info";
    case "IN_PROGRESS":
      return "pending";
    case "FULFILLED":
      return "success";
    case "CLOSED":
      return "inactive";
    case "CANCELLED":
      return "danger";
    default:
      return "draft";
  }
}

/**
 * Query 10 sales_order gần nhất có status CONFIRMED/SNAPSHOTTED/IN_PROGRESS,
 * thêm readiness từ bom_snapshot_line nếu có.
 * Không crash nếu không có orders hoặc không có snapshot lines.
 */
async function getRecentOrdersReal(): Promise<OrderReadinessRow[]> {
  const ACTIVE_STATUSES = ["CONFIRMED", "SNAPSHOTTED", "IN_PROGRESS"] as const;

  // 1) Query 10 orders active gần nhất, join item để lấy productName
  const orders = await db
    .select({
      id: salesOrder.id,
      orderNo: salesOrder.orderNo,
      customerName: salesOrder.customerName,
      productItemId: salesOrder.productItemId,
      itemName: item.name,
      itemSku: item.sku,
      status: salesOrder.status,
      dueDate: salesOrder.dueDate,
    })
    .from(salesOrder)
    .leftJoin(item, eq(salesOrder.productItemId, item.id))
    .where(
      inArray(
        salesOrder.status,
        ACTIVE_STATUSES as unknown as (typeof salesOrder.status.enumValues)[number][],
      ),
    )
    .orderBy(desc(salesOrder.createdAt))
    .limit(10);

  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);

  // 2) Aggregate snapshot line state per order (nếu có)
  // Count total lines + shortage lines
  type SnapRow = { orderId: string; total: number; shortage: number };
  let snapAgg: SnapRow[] = [];
  try {
    const rows = await db
      .select({
        orderId: bomSnapshotLine.orderId,
        total: sql<number>`count(*)::int`,
        shortage: sql<number>`count(*) filter (where ${bomSnapshotLine.remainingShortQty} > 0)::int`,
      })
      .from(bomSnapshotLine)
      .where(inArray(bomSnapshotLine.orderId, orderIds))
      .groupBy(bomSnapshotLine.orderId);
    snapAgg = rows as SnapRow[];
  } catch {
    // snapshot table có thể chưa có data — không crash
    snapAgg = [];
  }

  const snapMap = new Map<string, SnapRow>(
    snapAgg.map((r) => [r.orderId, r]),
  );

  // 3) WO progress per order (goodQty / plannedQty)
  type WoRow = { orderId: string; planned: number; good: number };
  let woAgg: WoRow[] = [];
  try {
    const rows = await db
      .select({
        orderId: workOrder.linkedOrderId,
        planned: sql<number>`coalesce(sum(${workOrder.plannedQty}), 0)::numeric`,
        good: sql<number>`coalesce(sum(${workOrder.goodQty}), 0)::numeric`,
      })
      .from(workOrder)
      .where(inArray(workOrder.linkedOrderId, orderIds))
      .groupBy(workOrder.linkedOrderId);
    woAgg = rows as unknown as WoRow[];
  } catch {
    woAgg = [];
  }
  const woMap = new Map<string, WoRow>(
    woAgg.filter((r) => r.orderId).map((r) => [r.orderId!, r]),
  );

  // 4) Map về OrderReadinessRow
  return orders.map((o) => {
    const snap = snapMap.get(o.id);
    const total = snap?.total ?? 0;
    const shortage = snap?.shortage ?? 0;
    const snapPct = total > 0 ? Math.round(((total - shortage) / total) * 100) : null;

    const wo = woMap.get(o.id);
    const woPct =
      wo && Number(wo.planned) > 0
        ? Math.round((Number(wo.good) / Number(wo.planned)) * 100)
        : null;

    const readinessPct = woPct ?? snapPct ?? 0;

    const productName =
      o.itemName
        ? `${o.itemSku ? o.itemSku + " — " : ""}${o.itemName}`
        : o.itemSku ?? `SKU: ${o.productItemId.slice(0, 8)}…`;

    return {
      id: o.id,
      orderCode: o.orderNo,
      customerName: o.customerName,
      productName,
      deadline: o.dueDate ?? new Date().toISOString(),
      readinessPercent: readinessPct,
      shortageSkus: shortage,
      status: mapOrderStatus(o.status),
    };
  });
}

/**
 * GET /api/dashboard/overview
 * Trả KPI tổng quan cho trang chủ. Cache Redis 60s để giảm tải queries
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

  // 2) Cache miss → queries song song.
  try {
    const [activeItemsCount, bomTemplatesCount, suppliersCount, woRunningCount, recentOrders] =
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
        // WO đang chạy — real data
        countRows(() =>
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(workOrder)
            .where(eq(workOrder.status, "IN_PROGRESS")),
        ),
        // Orders real từ DB
        getRecentOrdersReal(),
      ]);

    const payload: DashboardOverviewPayload = {
      activeItemsCount,
      bomTemplatesCount,
      suppliersCount,
      lowStockCount: null, // V1.2
      woRunningCount,
      recentOrders,
      recentAlertsMock: generateMockAlerts(),
      placeholder: {
        lowStockCount: "V1.2",
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
