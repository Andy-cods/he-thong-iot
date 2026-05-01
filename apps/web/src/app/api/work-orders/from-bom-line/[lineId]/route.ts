/**
 * V3.7.43 → V3.7.46 — POST /api/work-orders/from-bom-line/[lineId]
 *
 * V3.7.46: Đổi flow → tạo YÊU CẦU SẢN XUẤT (WO status=DRAFT) thay vì
 * lệnh chính thức (RELEASED). VH-A phải approve mới chuyển RELEASED.
 *
 * Workflow mới:
 *   TK-A click 🏭 GTAM trên BOM line
 *     → POST /work-orders/from-bom-line  (status=DRAFT — yêu cầu)
 *     → notify VH-A "WO_REQUEST_SUBMITTED"
 *   VH-A xem yêu cầu → POST /work-orders/[id]/approve
 *     → status: DRAFT → RELEASED
 *     → notify TK-A "WO_APPROVED"
 *   VH-A reject → POST /work-orders/[id]/reject (reason required)
 *     → status: DRAFT → CANCELLED
 *     → notify TK-A "WO_REJECTED"
 *
 * Body:
 *   - plannedQty (default metadata.totalQty)
 *   - priority (default NORMAL)
 *   - plannedStart / plannedEnd (optional)
 *   - notes (optional)
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { item as itemTable, workOrder } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { getLineById } from "@/server/repos/bomLines";
import { writeAudit } from "@/server/services/audit";
import { notifyWORequestSubmitted } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  plannedQty: z.coerce.number().positive().optional(),
  priority: z
    .enum(["LOW", "NORMAL", "HIGH", "URGENT"])
    .optional()
    .default("NORMAL"),
  plannedStart: z.string().optional().nullable(),
  plannedEnd: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { lineId: string } },
) {
  // RBAC: planner + operator + admin được tạo WO. (V3.7.31 đã fix matrix.)
  const guard = await requireCan(req, "create", "wo");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bodySchema);
  if ("response" in body) return body.response;

  const line = await getLineById(params.lineId);
  if (!line) return jsonError("NOT_FOUND", "Không tìm thấy BOM line.", 404);
  if (!line.componentItemId) {
    return jsonError("INVALID_LINE", "BOM line chưa link item.", 400);
  }

  // Default qty từ metadata.totalQty (Excel SL column)
  const meta = (line.metadata ?? {}) as {
    totalQty?: string | number;
    routing?: Record<string, unknown>;
    size?: string;
  };
  const plannedQty =
    body.data.plannedQty ??
    (Number(meta.totalQty ?? 0) || Number(line.qtyPerParent ?? 0));
  if (plannedQty <= 0) {
    return jsonError(
      "INVALID_QTY",
      "Số lượng kế hoạch phải > 0 (cung cấp plannedQty hoặc set metadata.totalQty).",
      400,
    );
  }

  // Verify item exists
  const [it] = await db
    .select({ id: itemTable.id, sku: itemTable.sku, name: itemTable.name })
    .from(itemTable)
    .where(eq(itemTable.id, line.componentItemId))
    .limit(1);
  if (!it) return jsonError("ITEM_NOT_FOUND", "Item không tồn tại.", 404);

  // Generate WO no
  const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
  const cntRows = await db.execute<{ c: number }>(sql`
    SELECT COUNT(*)::int AS c FROM app.work_order
    WHERE wo_no LIKE ${`WO-${yymm}-%`}
  `);
  const cnt = (cntRows as unknown as Array<{ c: number }>)[0]?.c ?? 0;
  const woNo = `WO-${yymm}-${(cnt + 1).toString().padStart(4, "0")}`;

  // Compose notes
  const notesText =
    body.data.notes ??
    `Yêu cầu sản xuất GTAM cho ${it.sku}${
      line.description ? ` — ${line.description}` : ""
    }${meta.size ? ` · Quy cách ${meta.size}` : ""}`;

  // routingPlan từ metadata.routing (có thể null nếu BOM mới import)
  const routingPlan =
    meta.routing && typeof meta.routing === "object" && Object.keys(meta.routing).length > 0
      ? meta.routing
      : null;

  try {
    // V3.7.46 — status=DRAFT (yêu cầu chờ duyệt). releasedAt=null.
    // VH-A approve sẽ set RELEASED + releasedAt.
    const [wo] = await db
      .insert(workOrder)
      .values({
        woNo,
        productItemId: line.componentItemId,
        plannedQty: String(plannedQty),
        status: "DRAFT",
        priority: body.data.priority,
        plannedStart: body.data.plannedStart || null,
        plannedEnd: body.data.plannedEnd || null,
        notes: notesText,
        materialRequirements: [],
        routingPlan: routingPlan as Record<string, unknown> | null,
        releasedAt: null,
        createdBy: guard.session.userId,
      })
      .returning();

    if (!wo) throw new Error("INSERT_FAILED");

    // Audit
    const reqMeta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "work_order",
      objectId: wo.id,
      after: {
        woNo: wo.woNo,
        productSku: it.sku,
        plannedQty,
        bomLineId: params.lineId,
        mode: "production_request_draft",
        status: "DRAFT",
      },
      notes: `Yêu cầu SX GTAM từ BOM line ${it.sku} (qty=${plannedQty}) — chờ VH duyệt`,
      ...reqMeta,
    });

    // V3.7.46 — Notify operator (VH-A) về YÊU CẦU sản xuất mới
    await notifyWORequestSubmitted({
      woId: wo.id,
      woNo: wo.woNo,
      productName: it.name ?? it.sku,
      plannedQty,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
    }).catch((err) => {
      logger.warn({ err, woId: wo.id }, "notify WO request submitted failed");
    });

    return NextResponse.json({ data: wo }, { status: 201 });
  } catch (err) {
    logger.error(
      { err, lineId: params.lineId },
      "create WO from BOM line failed",
    );
    return jsonError(
      "INTERNAL",
      `Không tạo được Đơn gia công SX: ${(err as Error).message}`,
      500,
    );
  }
}
