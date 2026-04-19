import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  WoConflictError,
  WoNotFoundError,
  WoTransitionError,
  completeWO,
} from "@/server/repos/workOrders";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  versionLock: z.number().int().nonnegative().optional(),
});

/** POST /api/assembly/wo/[id]/complete — finalize WO (check all issued). */
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
      action: "UPDATE",
      objectType: "work_order",
      objectId: wo.id,
      after: { status: wo.status, completedAt: wo.completedAt },
      notes: `WO ${wo.woNo} completed via assembly flow`,
      ...meta,
    });
    return NextResponse.json({ data: wo });
  } catch (err) {
    if (err instanceof WoConflictError)
      return jsonError(err.code, err.message, err.httpStatus);
    if (err instanceof WoTransitionError)
      return jsonError(err.code, err.message, err.httpStatus);
    if (err instanceof WoNotFoundError)
      return jsonError(err.code, err.message, err.httpStatus);
    logger.error({ err }, "complete WO via assembly failed");
    return jsonError("INTERNAL", "Lỗi hoàn tất WO.", 500);
  }
}
