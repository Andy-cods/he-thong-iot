import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  WoConflictError,
  getWorkOrder,
  updateWorkOrder,
} from "@/server/repos/workOrders";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** V1.9-P4 — routing step schema. */
const routingStepSchema = z.object({
  step_no: z.number().int().positive(),
  name: z.string().min(1).max(200),
  machine: z.string().max(100).optional().nullable(),
  setup_min: z.number().nonnegative().optional().nullable(),
  cycle_min: z.number().nonnegative().optional().nullable(),
  operator_id: z.string().uuid().optional().nullable(),
  status: z
    .enum(["PENDING", "IN_PROGRESS", "DONE", "SKIPPED"])
    .optional()
    .default("PENDING"),
  notes: z.string().max(500).optional().nullable(),
});

const materialReqSchema = z.object({
  item_id: z.string().uuid().optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  name: z.string().max(200),
  qty: z.number().nonnegative(),
  uom: z.string().max(20).optional().nullable(),
  allocated_qty: z.number().nonnegative().optional().default(0),
  lot_codes: z.array(z.string().max(100)).optional().default([]),
});

const toleranceSchema = z.record(z.string().max(100), z.unknown());

const patchSchema = z.object({
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  plannedStart: z.string().datetime().nullish(),
  plannedEnd: z.string().datetime().nullish(),
  notes: z.string().max(2000).nullish(),
  routingPlan: z.array(routingStepSchema).optional(),
  materialRequirements: z.array(materialReqSchema).optional(),
  technicalDrawingUrl: z.string().max(2048).url().nullish().or(z.literal("")),
  toleranceSpecs: toleranceSchema.optional(),
  estimatedHours: z.number().nonnegative().nullish(),
  versionLock: z.number().int().nonnegative(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "wo");
  if ("response" in guard) return guard.response;

  try {
    const wo = await getWorkOrder(params.id);
    if (!wo) return jsonError("NOT_FOUND", "Work Order không tồn tại.", 404);
    return NextResponse.json({ data: wo });
  } catch (err) {
    logger.error({ err, id: params.id }, "get WO failed");
    return jsonError("INTERNAL", "Lỗi tải Work Order.", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "wo");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, patchSchema);
  if ("response" in body) return body.response;

  try {
    const wo = await updateWorkOrder(params.id, {
      priority: body.data.priority,
      plannedStart: body.data.plannedStart
        ? new Date(body.data.plannedStart)
        : body.data.plannedStart === null
          ? null
          : undefined,
      plannedEnd: body.data.plannedEnd
        ? new Date(body.data.plannedEnd)
        : body.data.plannedEnd === null
          ? null
          : undefined,
      notes: body.data.notes,
      routingPlan: body.data.routingPlan,
      materialRequirements: body.data.materialRequirements,
      technicalDrawingUrl:
        body.data.technicalDrawingUrl === ""
          ? null
          : body.data.technicalDrawingUrl,
      toleranceSpecs: body.data.toleranceSpecs,
      estimatedHours: body.data.estimatedHours,
      expectedVersionLock: body.data.versionLock,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "work_order",
      objectId: wo.id,
      after: body.data,
      ...meta,
    });

    return NextResponse.json({ data: wo });
  } catch (err) {
    if (err instanceof WoConflictError) {
      return jsonError("CONFLICT", err.message, 409);
    }
    logger.error({ err, id: params.id }, "update WO failed");
    return jsonError("INTERNAL", "Không cập nhật được WO.", 500);
  }
}
