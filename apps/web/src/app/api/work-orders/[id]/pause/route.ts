import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  WoConflictError,
  WoNotFoundError,
  WoTransitionError,
  pauseWO,
  resumeWO,
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

const schema = z.object({
  mode: z.enum(["pause", "resume"]).default("pause"),
  reason: z.string().max(500).nullish(),
  versionLock: z.number().int().nonnegative().optional(),
});

/** POST /api/work-orders/[id]/pause — toggle pause/resume (admin/planner/operator). */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "wo");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  try {
    const wo =
      body.data.mode === "pause"
        ? await pauseWO(
            params.id,
            body.data.reason ?? null,
            body.data.versionLock,
          )
        : await resumeWO(params.id, body.data.versionLock);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: body.data.mode === "pause" ? "WO_PAUSE" : "WO_RESUME",
      objectType: "work_order",
      objectId: wo.id,
      after: {
        status: wo.status,
        pausedAt: wo.pausedAt,
        pausedReason: wo.pausedReason,
      },
      notes: body.data.reason ?? null,
      ...meta,
    });
    return NextResponse.json({ data: wo });
  } catch (err) {
    if (err instanceof WoNotFoundError) return jsonError("NOT_FOUND", err.message, 404);
    if (err instanceof WoConflictError) return jsonError("CONFLICT", err.message, 409);
    if (err instanceof WoTransitionError)
      return jsonError("INVALID_TRANSITION", err.message, 422);
    logger.error({ err, id: params.id }, "pause/resume WO failed");
    return jsonError("INTERNAL", "Không pause/resume được WO.", 500);
  }
}
