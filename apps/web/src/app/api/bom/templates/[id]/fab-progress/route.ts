import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bom/templates/[id]/fab-progress
 *
 * Trả tiến độ sản xuất (WO) cho các BOM line loại "fab" (gia công).
 *
 * V3.7.50 — link WO ↔ bom_line theo 2 đường (ưu tiên metadata):
 *   1) `bom_line.metadata #>> '{routing,linkedWorkOrderId}'` (explicit link)
 *   2) Fallback: WO mới nhất có `product_item_id = bom_line.component_item_id`
 *      và sắp xếp theo độ "đang chạy" (IN_PROGRESS > RELEASED > QUEUED >
 *      COMPLETED > DRAFT > CANCELLED) rồi created_at DESC.
 *      Lý do: khi user tạo WO từ "Tạo Đơn gia công SX" mà không set metadata,
 *      progress bar vẫn phải reflect trạng thái thực tế.
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
      WITH fab_lines AS (
        SELECT
          bl.id AS bom_line_id,
          bl.component_item_id,
          (bl.metadata #>> '{routing,linkedWorkOrderId}') AS linked_wo_id
        FROM app.bom_line bl
        WHERE bl.template_id = ${id}
          AND COALESCE(bl.metadata #>> '{kind}', '') = 'fab'
      ),
      explicit_link AS (
        SELECT
          fl.bom_line_id,
          wo.id AS wo_id,
          wo.wo_no,
          wo.status::text AS status,
          wo.planned_qty,
          wo.good_qty,
          wo.scrap_qty,
          1 AS link_kind
        FROM fab_lines fl
        JOIN app.work_order wo ON wo.id::text = fl.linked_wo_id
        WHERE fl.linked_wo_id IS NOT NULL
      ),
      fallback_link AS (
        SELECT DISTINCT ON (fl.bom_line_id)
          fl.bom_line_id,
          wo.id AS wo_id,
          wo.wo_no,
          wo.status::text AS status,
          wo.planned_qty,
          wo.good_qty,
          wo.scrap_qty,
          2 AS link_kind
        FROM fab_lines fl
        JOIN app.work_order wo ON wo.product_item_id = fl.component_item_id
        WHERE fl.linked_wo_id IS NULL
        ORDER BY
          fl.bom_line_id,
          CASE wo.status::text
            WHEN 'IN_PROGRESS' THEN 1
            WHEN 'PAUSED'      THEN 2
            WHEN 'RELEASED'    THEN 3
            WHEN 'QUEUED'      THEN 4
            WHEN 'COMPLETED'   THEN 5
            WHEN 'DRAFT'       THEN 6
            WHEN 'CANCELLED'   THEN 99
            ELSE 50
          END,
          wo.created_at DESC
      )
      SELECT * FROM explicit_link
      UNION ALL
      SELECT * FROM fallback_link
    `)) as unknown as Array<{
      bom_line_id: string;
      wo_id: string;
      wo_no: string;
      status: string;
      planned_qty: string;
      good_qty: string;
      scrap_qty: string;
      link_kind: number;
    }>;

    // V3.7.50 — stock per fab line: nếu kho có hàng đủ và không có WO active → coi là "Hoàn thành".
    const stockRows = (await db.execute(sql`
      WITH fab_lines AS (
        SELECT
          bl.id AS bom_line_id,
          bl.component_item_id
        FROM app.bom_line bl
        WHERE bl.template_id = ${id}
          AND COALESCE(bl.metadata #>> '{kind}', '') = 'fab'
      ),
      lot_on_hand AS (
        SELECT
          l.id,
          l.item_id,
          l.status::text AS status,
          COALESCE(SUM(
            CASE
              WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
              WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
              ELSE 0
            END
          ), 0)::numeric AS on_hand
        FROM app.inventory_lot_serial l
        LEFT JOIN app.inventory_txn t ON t.lot_serial_id = l.id
        WHERE l.item_id IN (SELECT component_item_id FROM fab_lines)
        GROUP BY l.id, l.item_id, l.status
      ),
      stock_per_item AS (
        SELECT
          item_id,
          SUM(CASE WHEN status = 'AVAILABLE' THEN on_hand ELSE 0 END)::numeric AS stock_available
        FROM lot_on_hand
        GROUP BY item_id
      ),
      reserved_per_item AS (
        SELECT
          l.item_id,
          SUM(r.reserved_qty)::numeric AS reserved
        FROM app.reservation r
        JOIN app.inventory_lot_serial l ON l.id = r.lot_serial_id
        WHERE r.status = 'ACTIVE'
          AND l.item_id IN (SELECT component_item_id FROM fab_lines)
        GROUP BY l.item_id
      )
      SELECT
        fl.bom_line_id,
        GREATEST(
          0,
          COALESCE(s.stock_available, 0) - COALESCE(r.reserved, 0)
        )::text AS stock_net
      FROM fab_lines fl
      LEFT JOIN stock_per_item s ON s.item_id = fl.component_item_id
      LEFT JOIN reserved_per_item r ON r.item_id = fl.component_item_id
    `)) as unknown as Array<{ bom_line_id: string; stock_net: string }>;
    const stockByLine: Record<string, number> = {};
    for (const sr of stockRows) {
      stockByLine[sr.bom_line_id] = Number(sr.stock_net) || 0;
    }

    const map: Record<
      string,
      {
        woId: string;
        woNo: string;
        status: string;
        plannedQty: string;
        goodQty: string;
        scrapQty: string;
        pct: number;
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
      // Nếu đã có entry (explicit link đi trước), giữ nguyên — không override bằng fallback.
      if (map[r.bom_line_id]) continue;

      const planned = Number(r.planned_qty) || 0;
      const good = Number(r.good_qty) || 0;
      const scrap = Number(r.scrap_qty) || 0;
      const totalDone = good + scrap;

      let pct = 0;
      const st = r.status;
      if (st === "COMPLETED") pct = 100;
      else if (st === "CANCELLED") pct = 0;
      else if (st === "IN_PROGRESS" || st === "PAUSED") {
        pct = planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
      } else if (st === "RELEASED" || st === "QUEUED") pct = 5;
      else pct = 0;

      const waiting =
        st === "DRAFT" || st === "QUEUED" || st === "RELEASED" ||
        st === "IN_PROGRESS" || st === "PAUSED" || st === "COMPLETED";
      const inProgress =
        st === "IN_PROGRESS" || st === "PAUSED" || st === "COMPLETED" || totalDone > 0;
      const paused = st === "PAUSED";
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

    // V3.7.50 — Fab line không có WO active nhưng có stock trong kho → hiển thị
    // "Hoàn thành" 100% (đã sản xuất xong + nhập kho). Ưu tiên WO real nếu có.
    for (const [bomLineId, stockNet] of Object.entries(stockByLine)) {
      if (map[bomLineId]) continue;
      if (stockNet <= 0) continue;
      map[bomLineId] = {
        woId: "",
        woNo: "",
        status: "COMPLETED",
        plannedQty: "0",
        goodQty: stockNet.toString(),
        scrapQty: "0",
        pct: 100,
        milestones: {
          waiting: true,
          inProgress: true,
          paused: false,
          qc: true,
          completed: true,
        },
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
