import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V1.7-beta.2.6 — GET /api/bom/templates/[id]/fab-progress
 *
 * Trả về tiến độ sản xuất (WO) cho các BOM line loại "fab" (gia công).
 * JOIN bom_line (templateId) ↔ work_order qua
 *   bom_line.metadata.routing.linkedWorkOrderId (UUID).
 *
 * Response:
 *   { data: { [bomLineId]: { woId, woNo, status, plannedQty, goodQty } } }
 *
 * Note: UUID trong jsonb lưu dạng string → cast khi equal.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const { id } = params;
  if (!/^[0-9a-f-]{8,}$/i.test(id)) {
    return jsonError("VALIDATION", "bomTemplateId không hợp lệ", 400);
  }

  try {
    const rows = (await db.execute(sql`
      SELECT
        bl.id AS bom_line_id,
        wo.id AS wo_id,
        wo.wo_no AS wo_no,
        wo.status::text AS status,
        wo.planned_qty AS planned_qty,
        wo.good_qty AS good_qty,
        wo.scrap_qty AS scrap_qty
      FROM app.bom_line bl
      JOIN app.work_order wo
        ON wo.id::text = (bl.metadata #>> '{routing,linkedWorkOrderId}')
      WHERE bl.template_id = ${id}
        AND (bl.metadata #>> '{routing,linkedWorkOrderId}') IS NOT NULL
    `)) as unknown as Array<{
      bom_line_id: string;
      wo_id: string;
      wo_no: string;
      status: string;
      planned_qty: string;
      good_qty: string;
      scrap_qty: string;
    }>;

    const map: Record<
      string,
      {
        woId: string;
        woNo: string;
        status: string;
        plannedQty: string;
        goodQty: string;
        scrapQty: string;
        /** V1.9 Phase 2 — tiến độ % thật (0-100) dựa trên good/planned + status. */
        pct: number;
        /** V1.9 Phase 2 — 5 mốc tiến độ kind=fab. */
        milestones: {
          waiting: boolean;
          inProgress: boolean;
          paused: boolean;
          qc: boolean;
          completed: boolean;
        };
      }
    > = {};
    for (const r of rows) {
      const planned = Number(r.planned_qty) || 0;
      const good = Number(r.good_qty) || 0;
      const scrap = Number(r.scrap_qty) || 0;
      const totalDone = good + scrap;

      // pct theo status
      let pct = 0;
      const st = r.status;
      if (st === "COMPLETED") pct = 100;
      else if (st === "CANCELLED") pct = 0;
      else if (st === "IN_PROGRESS" || st === "PAUSED") {
        pct = planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
      } else if (st === "RELEASED" || st === "QUEUED") pct = 5;
      else pct = 0;

      // milestones
      const waiting =
        st === "DRAFT" || st === "QUEUED" || st === "RELEASED" ||
        st === "IN_PROGRESS" || st === "PAUSED" || st === "COMPLETED";
      const inProgress =
        st === "IN_PROGRESS" || st === "PAUSED" || st === "COMPLETED" || totalDone > 0;
      const paused = st === "PAUSED";
      // QC mốc đạt khi good qty > 0 hoặc đã complete (pass QC)
      const qc = good > 0 || st === "COMPLETED";
      const completed = st === "COMPLETED";

      map[r.bom_line_id] = {
        woId: r.wo_id,
        woNo: r.wo_no,
        status: r.status,
        plannedQty: r.planned_qty,
        goodQty: r.good_qty,
        scrapQty: r.scrap_qty,
        pct,
        milestones: { waiting, inProgress, paused, qc, completed },
      };
    }

    return NextResponse.json({
      data: {
        bomTemplateId: id,
        progress: map,
      },
    });
  } catch (err) {
    logger.error({ err, bomTemplateId: id }, "fab-progress failed");
    return jsonError(
      "INTERNAL",
      "Lỗi tổng hợp tiến độ sản xuất linh kiện gia công.",
      500,
    );
  }
}
