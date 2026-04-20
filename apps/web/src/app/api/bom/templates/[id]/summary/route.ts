import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bom/templates/[id]/summary — V1.6 workspace KPI aggregate.
 *
 * Trả về counters cho ContextualSidebar badges + KPI header:
 *  - ordersTotal / ordersActive (chưa CLOSED/CANCELLED/FULFILLED)
 *  - workOrdersActive (DRAFT/QUEUED/IN_PROGRESS/PAUSED)
 *  - shortageComponents (count distinct component thiếu > 0)
 *  - ecoTotal / ecoActive (không phải APPLIED/REJECTED)
 *  - lineCount (BOM current tree size)
 *
 * Mục tiêu: 1 round-trip thay vì 5 API call. Query tương đối rẻ (index sẵn
 * trên bom_template_id, status). Không cache — data thay đổi thường xuyên.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{8,}$/i.test(id)) {
    return jsonError("VALIDATION", "bomTemplateId không hợp lệ", 400);
  }

  try {
    const rows = (await db.execute(sql`
      WITH orders_agg AS (
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE status NOT IN ('CLOSED', 'CANCELLED', 'FULFILLED')
          )::int AS active
        FROM app.sales_order
        WHERE bom_template_id = ${id}
      ),
      wo_agg AS (
        SELECT COUNT(wo.id)::int AS active
        FROM app.work_order wo
        JOIN app.sales_order so ON so.id = wo.linked_order_id
        WHERE so.bom_template_id = ${id}
          AND wo.status IN ('DRAFT', 'QUEUED', 'RELEASED', 'IN_PROGRESS', 'PAUSED')
      ),
      shortage_agg AS (
        SELECT COUNT(DISTINCT bsl.component_item_id)::int AS components
        FROM app.bom_snapshot_line bsl
        JOIN app.sales_order so ON so.id = bsl.order_id
        WHERE so.bom_template_id = ${id}
          AND bsl.remaining_short_qty > 0
      ),
      eco_agg AS (
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE status NOT IN ('APPLIED', 'REJECTED')
          )::int AS active
        FROM app.eco_change
        WHERE affected_template_id = ${id}
      ),
      bom_lines AS (
        SELECT COUNT(*)::int AS total
        FROM app.bom_line
        WHERE template_id = ${id}
      )
      SELECT
        o.total AS orders_total,
        o.active AS orders_active,
        w.active AS work_orders_active,
        s.components AS shortage_components,
        e.total AS eco_total,
        e.active AS eco_active,
        b.total AS line_count
      FROM orders_agg o
      CROSS JOIN wo_agg w
      CROSS JOIN shortage_agg s
      CROSS JOIN eco_agg e
      CROSS JOIN bom_lines b
    `)) as unknown as Array<{
      orders_total: number;
      orders_active: number;
      work_orders_active: number;
      shortage_components: number;
      eco_total: number;
      eco_active: number;
      line_count: number;
    }>;

    const row = rows[0] ?? {
      orders_total: 0,
      orders_active: 0,
      work_orders_active: 0,
      shortage_components: 0,
      eco_total: 0,
      eco_active: 0,
      line_count: 0,
    };

    return NextResponse.json({
      data: {
        bomTemplateId: id,
        ordersTotal: row.orders_total,
        ordersActive: row.orders_active,
        workOrdersActive: row.work_orders_active,
        shortageComponents: row.shortage_components,
        ecoTotal: row.eco_total,
        ecoActive: row.eco_active,
        lineCount: row.line_count,
      },
    });
  } catch (err) {
    logger.error({ err, bomTemplateId: id }, "bom summary failed");
    return jsonError(
      "INTERNAL",
      "Lỗi tổng hợp KPI BOM workspace.",
      500,
    );
  }
}
