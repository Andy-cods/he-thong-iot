import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createLsxWorkOrder } from "@/server/repos/workOrders";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.58 — POST /api/work-orders/lsx
 *
 * Tạo Work Order theo form LSX (Lệnh Sản Xuất GTAM) — standalone, không cần
 * sales order/snapshot. Dùng cho operator/planner/admin lập lệnh sản xuất
 * trực tiếp với đầy đủ routing + materials + tools + product spec.
 *
 * Phê duyệt 4 chữ ký + xác nhận liên bộ phận sẽ làm phase 3 (gác theo user).
 */

const routingStepSchema = z.object({
  step_no: z.coerce.number().int().nonnegative(),
  name: z.string().trim().min(1),
  machine: z.string().trim().max(255).optional().nullable(),
  equipment: z.string().trim().max(255).optional().nullable(),
  setup_min: z.coerce.number().nonnegative().optional().nullable(),
  cycle_min: z.coerce.number().nonnegative().optional().nullable(),
  duration_min: z.coerce.number().nonnegative().optional().nullable(),
  operator_id: z.string().uuid().optional().nullable(),
  assigned_operator: z.string().trim().max(255).optional().nullable(),
  qc_required: z.boolean().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const materialReqSchema = z.object({
  item_id: z.string().uuid().optional().nullable(),
  sku: z.string().trim().max(64).optional().nullable(),
  name: z.string().trim().min(1),
  qty: z.coerce.number().nonnegative(),
  uom: z.string().trim().max(16).optional().nullable(),
  allocated_qty: z.coerce.number().nonnegative().optional(),
  lot_codes: z.array(z.string().trim()).optional(),
  warehouse_code: z.string().trim().max(64).optional().nullable(),
});

const toolReqSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().max(128).optional().nullable(),
  machine: z.string().trim().max(255).optional().nullable(),
  qty: z.coerce.number().nonnegative().optional(),
  uom: z.string().trim().max(16).optional().nullable(),
  status: z.string().trim().max(32).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const productSpecSchema = z.object({
  dimensions: z.string().trim().max(255).optional().nullable(),
  technicalRequirements: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const lsxCreateSchema = z.object({
  productItemId: z.string().uuid(),
  plannedQty: z.coerce.number().positive(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  plannedStart: z.string().optional().nullable(),
  plannedEnd: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  orderType: z.enum(["NEW", "REPAIR", "TRIAL"]).default("NEW"),
  creatorDepartment: z.string().trim().max(64).optional().nullable(),
  routingPlan: z.array(routingStepSchema).optional(),
  materialRequirements: z.array(materialReqSchema).optional(),
  toolsRequired: z.array(toolReqSchema).optional(),
  productSpecification: productSpecSchema.optional(),
  technicalDrawingUrl: z.string().trim().max(2000).optional().nullable(),
  estimatedHours: z.coerce.number().nonnegative().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "wo");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, lsxCreateSchema);
  if ("response" in body) return body.response;

  try {
    const wo = await createLsxWorkOrder({
      productItemId: body.data.productItemId,
      plannedQty: body.data.plannedQty,
      priority: body.data.priority,
      plannedStart: body.data.plannedStart ? new Date(body.data.plannedStart) : null,
      plannedEnd: body.data.plannedEnd ? new Date(body.data.plannedEnd) : null,
      notes: body.data.notes ?? null,
      orderType: body.data.orderType,
      creatorDepartment: body.data.creatorDepartment ?? null,
      routingPlan: body.data.routingPlan ?? null,
      materialRequirements: body.data.materialRequirements ?? null,
      toolsRequired: body.data.toolsRequired ?? null,
      productSpecification: body.data.productSpecification ?? null,
      technicalDrawingUrl: body.data.technicalDrawingUrl ?? null,
      estimatedHours: body.data.estimatedHours ?? null,
      userId: guard.session.userId,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "work_order",
      objectId: wo.id,
      after: {
        woNo: wo.woNo,
        orderType: body.data.orderType,
        plannedQty: body.data.plannedQty,
        productItemId: body.data.productItemId,
        creatorDepartment: body.data.creatorDepartment,
        routingSteps: body.data.routingPlan?.length ?? 0,
        materials: body.data.materialRequirements?.length ?? 0,
        tools: body.data.toolsRequired?.length ?? 0,
      },
      notes: `LSX ${wo.woNo} created (orderType=${body.data.orderType})`,
      ...meta,
    });

    return NextResponse.json({ data: wo }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create LSX work order failed");
    const msg = (err as Error).message;
    if (msg === "PLANNED_QTY_REQUIRED") {
      return jsonError("VALIDATION", "plannedQty phải > 0.", 422);
    }
    return jsonError("INTERNAL", "Không tạo được Lệnh Sản Xuất.", 500);
  }
}
