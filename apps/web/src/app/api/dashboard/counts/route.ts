import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import {
  bomTemplate,
  item,
  purchaseOrder,
  purchaseRequest,
  salesOrder,
  supplier,
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
 * V3.5 — Dashboard counts. Đếm số lượng entities thực tế trong DB
 * cho dashboard chart + cards.
 *
 * Trả về count với breakdown by status cho từng entity.
 * Cache Redis 30s (đồng bộ với overview-v2).
 */

const CACHE_KEY = "dashboard:counts:v1";
const CACHE_TTL_SECONDS = 30;

export interface EntityCount {
  total: number;
  active: number;
  /** Color label cho chart (matches Tailwind). */
  color: string;
  /** Icon name từ lucide-react. */
  iconName: string;
  /** URL navigate. */
  href: string;
}

export interface DashboardCountsPayload {
  cachedAt: string;
  counts: {
    bomTemplates: EntityCount;
    salesOrders: EntityCount;
    purchaseRequests: EntityCount;
    purchaseOrders: EntityCount;
    workOrders: EntityCount;
    items: EntityCount;
    suppliers: EntityCount;
  };
  /** Bar chart data — sorted by total DESC */
  chart: Array<{
    key: string;
    label: string;
    total: number;
    active: number;
    color: string;
    iconName: string;
    href: string;
  }>;
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  // Try cache
  try {
    const cached = await cacheGetJson<DashboardCountsPayload>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" },
      });
    }
  } catch (err) {
    logger.warn({ err }, "cache get failed");
  }

  try {
    const [
      bomCounts,
      orderCounts,
      prCounts,
      poCounts,
      woCounts,
      itemCounts,
      supplierCounts,
    ] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${bomTemplate.status} in ('DRAFT','ACTIVE'))::int`,
        })
        .from(bomTemplate),
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${salesOrder.status} in ('DRAFT','CONFIRMED','SNAPSHOTTED','IN_PROGRESS'))::int`,
        })
        .from(salesOrder),
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${purchaseRequest.status} in ('DRAFT','SUBMITTED','APPROVED'))::int`,
        })
        .from(purchaseRequest),
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${purchaseOrder.status} in ('DRAFT','SENT','PARTIAL'))::int`,
        })
        .from(purchaseOrder),
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${workOrder.status} in ('RELEASED','IN_PROGRESS','PAUSED'))::int`,
        })
        .from(workOrder),
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${item.isActive} = true)::int`,
        })
        .from(item),
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${supplier.isActive} = true)::int`,
        })
        .from(supplier),
    ]);

    const counts: DashboardCountsPayload["counts"] = {
      bomTemplates: {
        total: bomCounts[0]?.total ?? 0,
        active: bomCounts[0]?.active ?? 0,
        color: "indigo",
        iconName: "Layers",
        href: "/engineering?tab=bom",
      },
      salesOrders: {
        total: orderCounts[0]?.total ?? 0,
        active: orderCounts[0]?.active ?? 0,
        color: "blue",
        iconName: "ClipboardList",
        href: "/orders",
      },
      purchaseRequests: {
        total: prCounts[0]?.total ?? 0,
        active: prCounts[0]?.active ?? 0,
        color: "violet",
        iconName: "FileText",
        href: "/engineering?tab=pr",
      },
      purchaseOrders: {
        total: poCounts[0]?.total ?? 0,
        active: poCounts[0]?.active ?? 0,
        color: "amber",
        iconName: "ShoppingCart",
        href: "/sales?tab=po",
      },
      workOrders: {
        total: woCounts[0]?.total ?? 0,
        active: woCounts[0]?.active ?? 0,
        color: "rose",
        iconName: "Factory",
        href: "/engineering?tab=work-orders",
      },
      items: {
        total: itemCounts[0]?.total ?? 0,
        active: itemCounts[0]?.active ?? 0,
        color: "emerald",
        iconName: "Boxes",
        href: "/items",
      },
      suppliers: {
        total: supplierCounts[0]?.total ?? 0,
        active: supplierCounts[0]?.active ?? 0,
        color: "cyan",
        iconName: "Building2",
        href: "/sales?tab=suppliers",
      },
    };

    const labels: Record<keyof DashboardCountsPayload["counts"], string> = {
      bomTemplates: "BOM",
      salesOrders: "Đơn hàng",
      purchaseRequests: "PR",
      purchaseOrders: "PO",
      workOrders: "Lệnh SX",
      items: "Linh kiện",
      suppliers: "NCC",
    };

    const chart = (Object.entries(counts) as Array<
      [keyof typeof counts, EntityCount]
    >).map(([k, v]) => ({
      key: k,
      label: labels[k],
      total: v.total,
      active: v.active,
      color: v.color,
      iconName: v.iconName,
      href: v.href,
    }));
    // Don't sort — keep stable order to avoid jumpiness

    const payload: DashboardCountsPayload = {
      cachedAt: new Date().toISOString(),
      counts,
      chart,
    };

    try {
      await cacheSetJson(CACHE_KEY, payload, CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn({ err }, "cache set failed");
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (err) {
    logger.error({ err }, "dashboard counts failed");
    return jsonError(
      "DASHBOARD_COUNTS_FAILED",
      (err as Error).message ?? "Không lấy được counts",
      500,
    );
  }
}
