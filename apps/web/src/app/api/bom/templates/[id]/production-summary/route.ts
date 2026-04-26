import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  bomSnapshotLine,
  bomTemplate,
  salesOrder,
  workOrder,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface BomWorkOrderSummaryItem {
  id: string;
  woNo: string;
  status: string;
  priority: string;
  orderNo: string | null;
  plannedQty: number;
  goodQty: number;
  scrapQty: number;
  progressPct: number;
  plannedStart: string | null;
  plannedEnd: string | null;
}

export interface BomProductionSummary {
  bomTemplateId: string;
  totalWorkOrders: number;
  doneWorkOrders: number;
  inProgressWorkOrders: number;
  donePct: number;
  totalPlannedQty: number;
  totalGoodQty: number;
  totalScrapQty: number;
  qtyDonePct: number;
  recentWorkOrders: BomWorkOrderSummaryItem[];
  snapshotSummary: {
    totalLines: number;
    shortageLines: number;
    materialReadyPct: number;
  } | null;
}

/**
 * V2.0 P2 W6 — TASK-20260427-013.
 *
 * GET /api/bom/templates/[id]/production-summary
 *
 * Aggregate Work Orders theo bom_template_id (qua sales_order link).
 *
 * Response:
 *   - totalWorkOrders / doneWorkOrders / inProgressWorkOrders
 *   - donePct = doneWO / totalWO
 *   - totalPlannedQty / totalGoodQty / totalScrapQty (sum across WO)
 *   - qtyDonePct = goodQty / plannedQty
 *   - recentWorkOrders[] (latest 20 WO)
 *   - snapshotSummary (count lines + shortage)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "salesOrder");
  if ("response" in guard) return guard.response;

  const id = params.id;
  if (!/^[0-9a-f-]{8,}$/i.test(id)) {
    return jsonError("VALIDATION", "bomTemplateId không hợp lệ", 400);
  }

  const [tpl] = await db
    .select({ id: bomTemplate.id })
    .from(bomTemplate)
    .where(eq(bomTemplate.id, id))
    .limit(1);
  if (!tpl) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  try {
    // Aggregate WO totals
    const aggRows = await db
      .select({
        total: sql<number>`count(${workOrder.id})::int`,
        done: sql<number>`count(${workOrder.id}) filter (where ${workOrder.status} = 'COMPLETED')::int`,
        inProgress: sql<number>`count(${workOrder.id}) filter (where ${workOrder.status} in ('IN_PROGRESS','PAUSED'))::int`,
        totalPlanned: sql<number>`coalesce(sum(${workOrder.plannedQty})::float, 0)`,
        totalGood: sql<number>`coalesce(sum(${workOrder.goodQty})::float, 0)`,
        totalScrap: sql<number>`coalesce(sum(${workOrder.scrapQty})::float, 0)`,
      })
      .from(workOrder)
      .innerJoin(salesOrder, eq(salesOrder.id, workOrder.linkedOrderId))
      .where(eq(salesOrder.bomTemplateId, id));

    const agg = aggRows[0] ?? {
      total: 0,
      done: 0,
      inProgress: 0,
      totalPlanned: 0,
      totalGood: 0,
      totalScrap: 0,
    };

    // Recent WO list (latest 20)
    const woRows = await db
      .select({
        id: workOrder.id,
        woNo: workOrder.woNo,
        status: workOrder.status,
        priority: workOrder.priority,
        orderNo: salesOrder.orderNo,
        plannedQty: workOrder.plannedQty,
        goodQty: workOrder.goodQty,
        scrapQty: workOrder.scrapQty,
        plannedStart: workOrder.plannedStart,
        plannedEnd: workOrder.plannedEnd,
      })
      .from(workOrder)
      .innerJoin(salesOrder, eq(salesOrder.id, workOrder.linkedOrderId))
      .where(eq(salesOrder.bomTemplateId, id))
      .orderBy(desc(workOrder.createdAt))
      .limit(20);

    const recentWorkOrders: BomWorkOrderSummaryItem[] = woRows.map((wo) => {
      const planned = Number(wo.plannedQty ?? "0");
      const good = Number(wo.goodQty ?? "0");
      const scrap = Number(wo.scrapQty ?? "0");
      const pct = planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
      return {
        id: wo.id,
        woNo: wo.woNo,
        status: wo.status,
        priority: wo.priority,
        orderNo: wo.orderNo ?? null,
        plannedQty: planned,
        goodQty: good,
        scrapQty: scrap,
        progressPct: pct,
        plannedStart: wo.plannedStart ?? null,
        plannedEnd: wo.plannedEnd ?? null,
      };
    });

    // Snapshot summary
    let snapshotSummary: BomProductionSummary["snapshotSummary"] = null;
    try {
      const snapRows = await db
        .select({
          totalLines: sql<number>`count(*)::int`,
          shortageLines: sql<number>`count(*) filter (where ${bomSnapshotLine.remainingShortQty} > 0)::int`,
          readyLines: sql<number>`count(*) filter (where ${bomSnapshotLine.state} in ('AVAILABLE','RESERVED','ISSUED','ASSEMBLED'))::int`,
        })
        .from(bomSnapshotLine)
        .innerJoin(salesOrder, eq(salesOrder.id, bomSnapshotLine.orderId))
        .where(eq(salesOrder.bomTemplateId, id));

      const r = snapRows[0];
      if (r && r.totalLines > 0) {
        snapshotSummary = {
          totalLines: r.totalLines,
          shortageLines: r.shortageLines,
          materialReadyPct: Math.round((r.readyLines / r.totalLines) * 100),
        };
      }
    } catch (snapErr) {
      logger.warn({ snapErr, bomTemplateId: id }, "snapshot summary failed");
    }

    const total = Number(agg.total ?? 0);
    const done = Number(agg.done ?? 0);
    const inProgress = Number(agg.inProgress ?? 0);
    const totalPlanned = Number(agg.totalPlanned ?? 0);
    const totalGood = Number(agg.totalGood ?? 0);
    const totalScrap = Number(agg.totalScrap ?? 0);
    const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
    const qtyDonePct =
      totalPlanned > 0 ? Math.round((totalGood / totalPlanned) * 100) : 0;

    const result: BomProductionSummary = {
      bomTemplateId: id,
      totalWorkOrders: total,
      doneWorkOrders: done,
      inProgressWorkOrders: inProgress,
      donePct,
      totalPlannedQty: totalPlanned,
      totalGoodQty: totalGood,
      totalScrapQty: totalScrap,
      qtyDonePct,
      recentWorkOrders,
      snapshotSummary,
    };

    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error({ err, bomTemplateId: id }, "bom production-summary failed");
    return jsonError("INTERNAL", "Không tải được tiến độ sản xuất.", 500);
  }
}
