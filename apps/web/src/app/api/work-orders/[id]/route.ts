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

const patchSchema = z.object({
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  plannedStart: z.string().datetime().nullish(),
  plannedEnd: z.string().datetime().nullish(),
  notes: z.string().max(2000).nullish(),
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
