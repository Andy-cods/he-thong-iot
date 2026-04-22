import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V1.7-beta.2.6 — GET /api/work-orders/[id]/source-bom
 *
 * Reverse lookup: tìm bom_line có metadata.routing.linkedWorkOrderId = woId.
 * Trả về BOM template + line metadata (materialCode, blankSize, processRoute)
 * để enrichment tab "Thông tin" của WO detail page.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "wo");
  if ("response" in guard) return guard.response;

  const { id } = params;
  if (!/^[0-9a-f-]{8,}$/i.test(id)) {
    return jsonError("VALIDATION", "workOrderId không hợp lệ", 400);
  }

  try {
    const rows = (await db.execute(sql`
      SELECT
        bl.id AS line_id,
        bl.template_id AS template_id,
        bt.code AS template_code,
        bt.name AS template_name,
        i.sku AS component_sku,
        i.name AS component_name,
        bl.metadata AS metadata
      FROM app.bom_line bl
      JOIN app.bom_template bt ON bt.id = bl.template_id
      LEFT JOIN app.item i ON i.id = bl.component_item_id
      WHERE (bl.metadata #>> '{routing,linkedWorkOrderId}') = ${id}
      LIMIT 1
    `)) as unknown as Array<{
      line_id: string;
      template_id: string;
      template_code: string;
      template_name: string;
      component_sku: string | null;
      component_name: string | null;
      metadata: Record<string, unknown> | null;
    }>;

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
      data: {
        lineId: row.line_id,
        templateId: row.template_id,
        templateCode: row.template_code,
        templateName: row.template_name,
        componentSku: row.component_sku,
        componentName: row.component_name,
        metadata: row.metadata ?? {},
      },
    });
  } catch (err) {
    logger.error({ err, woId: id }, "source-bom lookup failed");
    return jsonError(
      "INTERNAL",
      "Lỗi tra cứu nguồn BOM của Work Order.",
      500,
    );
  }
}
