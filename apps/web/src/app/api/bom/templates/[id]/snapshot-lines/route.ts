import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  bomSnapshotLine,
  bomTemplate,
  salesOrder,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import type { BomSnapshotState } from "@iot/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V2.0 P2 W6 — TASK-20260427-013.
 *
 * GET /api/bom/templates/[id]/snapshot-lines
 *
 * List snapshot lines của TẤT CẢ orders dùng BOM (qua sales_order.bom_template_id).
 * Filter optional:
 *   - state[]: BomSnapshotLineState[]
 *   - q: search SKU/name
 *   - orderCode: filter theo order
 *   - shortOnly: chỉ shortage
 *   - page / pageSize
 *
 * Reuse cho tab "Snapshot Board" trong BOM workspace (gộp từ /orders/[code]).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomSnapshot");
  if ("response" in guard) return guard.response;

  const id = params.id;
  if (!/^[0-9a-f-]{8,}$/i.test(id)) {
    return jsonError("VALIDATION", "bomTemplateId không hợp lệ", 400);
  }

  // Validate template tồn tại
  const [tpl] = await db
    .select({ id: bomTemplate.id })
    .from(bomTemplate)
    .where(eq(bomTemplate.id, id))
    .limit(1);
  if (!tpl) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  const sp = req.nextUrl.searchParams;
  const states = sp.getAll("state") as BomSnapshotState[];
  const q = sp.get("q")?.trim();
  const orderCodeFilter = sp.get("orderCode")?.trim();
  const shortOnly = sp.get("shortOnly") === "1" || sp.get("shortOnly") === "true";
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    1000,
    Math.max(1, Number(sp.get("pageSize") ?? 200) || 200),
  );

  try {
    const conds = [eq(salesOrder.bomTemplateId, id)];
    if (states.length > 0) conds.push(inArray(bomSnapshotLine.state, states));
    if (q && q.length > 0) {
      const like = `%${q}%`;
      const orExpr = or(
        ilike(bomSnapshotLine.componentSku, like),
        ilike(bomSnapshotLine.componentName, like),
      );
      if (orExpr) conds.push(orExpr);
    }
    if (orderCodeFilter && orderCodeFilter.length > 0) {
      conds.push(ilike(salesOrder.orderNo, `%${orderCodeFilter}%`));
    }
    if (shortOnly) {
      conds.push(sql`${bomSnapshotLine.remainingShortQty} > 0`);
    }

    const whereExpr = and(...conds);

    // Total count
    const totalRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(bomSnapshotLine)
      .innerJoin(salesOrder, eq(salesOrder.id, bomSnapshotLine.orderId))
      .where(whereExpr);
    const total = totalRows[0]?.c ?? 0;

    // Page rows
    const rows = await db
      .select({
        id: bomSnapshotLine.id,
        orderId: bomSnapshotLine.orderId,
        orderNo: salesOrder.orderNo,
        customerName: salesOrder.customerName,
        revisionId: bomSnapshotLine.revisionId,
        parentSnapshotLineId: bomSnapshotLine.parentSnapshotLineId,
        level: bomSnapshotLine.level,
        path: bomSnapshotLine.path,
        componentItemId: bomSnapshotLine.componentItemId,
        componentSku: bomSnapshotLine.componentSku,
        componentName: bomSnapshotLine.componentName,
        requiredQty: bomSnapshotLine.requiredQty,
        grossRequiredQty: bomSnapshotLine.grossRequiredQty,
        openPurchaseQty: bomSnapshotLine.openPurchaseQty,
        receivedQty: bomSnapshotLine.receivedQty,
        qcPassQty: bomSnapshotLine.qcPassQty,
        reservedQty: bomSnapshotLine.reservedQty,
        issuedQty: bomSnapshotLine.issuedQty,
        assembledQty: bomSnapshotLine.assembledQty,
        remainingShortQty: bomSnapshotLine.remainingShortQty,
        state: bomSnapshotLine.state,
        transitionedAt: bomSnapshotLine.transitionedAt,
        transitionedBy: bomSnapshotLine.transitionedBy,
        versionLock: bomSnapshotLine.versionLock,
        notes: bomSnapshotLine.notes,
        createdAt: bomSnapshotLine.createdAt,
        updatedAt: bomSnapshotLine.updatedAt,
      })
      .from(bomSnapshotLine)
      .innerJoin(salesOrder, eq(salesOrder.id, bomSnapshotLine.orderId))
      .where(whereExpr)
      .orderBy(
        desc(bomSnapshotLine.createdAt),
        bomSnapshotLine.path,
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Summary by state (for badge filter UI)
    const summaryRows = await db
      .select({
        state: bomSnapshotLine.state,
        count: sql<number>`count(*)::int`,
      })
      .from(bomSnapshotLine)
      .innerJoin(salesOrder, eq(salesOrder.id, bomSnapshotLine.orderId))
      .where(eq(salesOrder.bomTemplateId, id))
      .groupBy(bomSnapshotLine.state);

    return NextResponse.json({
      data: rows.map((r) => ({
        ...r,
        transitionedAt:
          r.transitionedAt instanceof Date
            ? r.transitionedAt.toISOString()
            : r.transitionedAt,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt),
        updatedAt:
          r.updatedAt instanceof Date
            ? r.updatedAt.toISOString()
            : String(r.updatedAt),
      })),
      meta: {
        page,
        pageSize,
        total,
        byState: summaryRows,
      },
    });
  } catch (err) {
    logger.error({ err, bomTemplateId: id }, "bom snapshot-lines failed");
    return jsonError("INTERNAL", "Không tải được snapshot lines.", 500);
  }
}
