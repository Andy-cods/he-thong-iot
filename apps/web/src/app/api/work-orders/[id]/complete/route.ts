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
import { requireSession } from "@/server/session";

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
  const guard = await requireSession(req, "admin", "planner");
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
