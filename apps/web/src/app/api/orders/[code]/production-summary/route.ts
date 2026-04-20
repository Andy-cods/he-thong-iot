import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  salesOrder,
  workOrder,
  workOrderLine,
  bomSnapshotLine,
  assemblyOrder,
  assemblyScan,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface WorkOrderSummaryItem {
  id: string;
  woCode: string;
  status: string;
  priority: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  completedQty: number;
  totalQty: number;
  progressPct: number;
}

export interface SnapshotSummary {
  totalLines: number;
  planned: number;
  purchasing: number;
  available: number;
  reserved: number;
  issued: number;
  assembled: number;
  shortage: number;
  materialReadyPct: number;
}

export interface AssemblyProgressSummary {
  totalRequired: number;
  totalScanned: number;
  progressPct: number;
}

export interface OrderProductionSummary {
  workOrders: WorkOrderSummaryItem[];
  snapshotSummary: SnapshotSummary | null;
  assemblyProgress: AssemblyProgressSummary | null;
}

/**
 * GET /api/orders/[code]/production-summary
 * Trả tổng hợp tiến độ sản xuất cho 1 order: WO list + BOM readiness + Assembly.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireCan(req, "read", "salesOrder");
  if ("response" in guard) return guard.response;

  try {
    // 1) Lookup order by code
    const [order] = await db
      .select({ id: salesOrder.id, orderNo: salesOrder.orderNo })
      .from(salesOrder)
      .where(eq(salesOrder.orderNo, params.code))
      .limit(1);

    if (!order) {
      return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);
    }

    const orderId = order.id;

    // 2) Work Orders + progress từ goodQty / plannedQty
    const woRows = await db
      .select({
        id: workOrder.id,
        woNo: workOrder.woNo,
        status: workOrder.status,
        priority: workOrder.priority,
        plannedStart: workOrder.plannedStart,
        plannedEnd: workOrder.plannedEnd,
        goodQty: workOrder.goodQty,
        plannedQty: workOrder.plannedQty,
      })
      .from(workOrder)
      .where(eq(workOrder.linkedOrderId, orderId))
      .orderBy(workOrder.createdAt);

    const workOrders: WorkOrderSummaryItem[] = woRows.map((wo) => {
      const completed = Number(wo.goodQty ?? "0");
      const total = Number(wo.plannedQty ?? "1");
      const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
      return {
        id: wo.id,
        woCode: wo.woNo,
        status: wo.status,
        priority: wo.priority,
        plannedStartDate: wo.plannedStart ?? null,
        plannedEndDate: wo.plannedEnd ?? null,
        completedQty: completed,
        totalQty: total,
        progressPct,
      };
    });

    // 3) BOM Snapshot summary — aggregate states
    let snapshotSummary: SnapshotSummary | null = null;
    try {
      const snapRows = await db
        .select({
          state: bomSnapshotLine.state,
          count: sql<number>`count(*)::int`,
          shortageCount: sql<number>`count(*) filter (where ${bomSnapshotLine.remainingShortQty} > 0)::int`,
        })
        .from(bomSnapshotLine)
        .where(eq(bomSnapshotLine.orderId, orderId))
        .groupBy(bomSnapshotLine.state);

      if (snapRows.length > 0) {
        const stateMap = new Map<string, number>(
          snapRows.map((r) => [r.state, r.count]),
        );
        const totalLines = snapRows.reduce((s, r) => s + r.count, 0);
        // Shortage: lines where remaining_short_qty > 0 (sum from all rows)
        const shortage = snapRows.reduce((s, r) => s + (r.shortageCount ?? 0), 0);

        const available = stateMap.get("AVAILABLE") ?? 0;
        const reserved = stateMap.get("RESERVED") ?? 0;
        const issued = stateMap.get("ISSUED") ?? 0;
        const assembled = stateMap.get("ASSEMBLED") ?? 0;
        const planned = stateMap.get("PLANNED") ?? 0;
        const purchasing = stateMap.get("PURCHASING") ?? 0;

        const readyCount = available + reserved + issued + assembled;
        const materialReadyPct =
          totalLines > 0 ? Math.round((readyCount / totalLines) * 100) : 0;

        snapshotSummary = {
          totalLines,
          planned,
          purchasing,
          available,
          reserved,
          issued,
          assembled,
          shortage,
          materialReadyPct,
        };
      }
    } catch (snapErr) {
      logger.warn({ snapErr, orderId }, "snapshot summary query failed — skipping");
    }

    // 4) Assembly progress từ assembly_order + assembly_scan
    let assemblyProgress: AssemblyProgressSummary | null = null;
    try {
      // Lấy assembly orders cho order này
      const aoRows = await db
        .select({
          id: assemblyOrder.id,
          plannedQty: assemblyOrder.plannedQty,
          completedQty: assemblyOrder.completedQty,
        })
        .from(assemblyOrder)
        .where(eq(assemblyOrder.orderId, orderId));

      if (aoRows.length > 0) {
        const totalRequired = aoRows.reduce(
          (s, r) => s + Number(r.plannedQty ?? "0"),
          0,
        );
        const totalScanned = aoRows.reduce(
          (s, r) => s + Number(r.completedQty ?? "0"),
          0,
        );
        const progressPct =
          totalRequired > 0
            ? Math.round((totalScanned / totalRequired) * 100)
            : 0;
        assemblyProgress = { totalRequired, totalScanned, progressPct };
      }
    } catch (aoErr) {
      logger.warn({ aoErr, orderId }, "assembly progress query failed — skipping");
    }

    const result: OrderProductionSummary = {
      workOrders,
      snapshotSummary,
      assemblyProgress,
    };

    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error({ err, code: params.code }, "production-summary query failed");
    return jsonError("INTERNAL", "Không tải được tiến độ sản xuất.", 500);
  }
}
