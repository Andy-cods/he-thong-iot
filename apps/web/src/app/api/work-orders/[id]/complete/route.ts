import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  WoConflictError,
  WoNotFoundError,
  WoTransitionError,
  completeWO,
} from "@/server/repos/workOrders";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { insertActivityLog } from "@/server/repos/activityLogs";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  versionLock: z.number().int().nonnegative().optional(),
});

/** POST /api/work-orders/[id]/complete — IN_PROGRESS → COMPLETED (admin/planner). */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "wo");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  try {
    const wo = await completeWO(params.id, body.data.versionLock);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "WO_COMPLETE",
      objectType: "work_order",
      objectId: wo.id,
      after: { status: wo.status, completedAt: wo.completedAt },
      ...meta,
    });

    // Activity log + trigger derived status sync (fire-and-forget)
    void insertActivityLog({
      userId: guard.session.userId,
      entityType: "work_order",
      entityId: wo.id,
      action: "WO_COMPLETED",
      diffJson: { status: wo.status, completedAt: wo.completedAt },
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return NextResponse.json({ data: wo });
  } catch (err) {
    if (err instanceof WoNotFoundError) return jsonError("NOT_FOUND", err.message, 404);
    if (err instanceof WoConflictError) return jsonError("CONFLICT", err.message, 409);
    if (err instanceof WoTransitionError)
      return jsonError("INVALID_TRANSITION", err.message, 422);
    logger.error({ err, id: params.id }, "complete WO failed");
    return jsonError("INTERNAL", "Không complete được WO.", 500);
  }
}
