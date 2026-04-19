import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  ReservationError,
  reserveSnapshotLine,
} from "@/server/repos/reservations";
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
  snapshotLineId: z.string().uuid(),
  qty: z.number().positive(),
  woId: z.string().uuid().optional(),
  manualLotId: z.string().uuid().optional(),
});

/** POST /api/reservations/reserve — auto FIFO/FEFO reserve (admin/planner/warehouse). */
export async function POST(req: NextRequest) {
  const guard = await requireSession(
    req,
    "admin",
    "planner",
    "warehouse",
  );
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  try {
    const result = await reserveSnapshotLine({
      snapshotLineId: body.data.snapshotLineId,
      qty: body.data.qty,
      woId: body.data.woId ?? null,
      manualLotId: body.data.manualLotId ?? null,
      userId: guard.session.userId,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "RESERVE",
      objectType: "reservation",
      objectId: result.reservationId,
      after: result,
      notes: `Reserved ${result.reservedQty} @ lot ${result.lotCode ?? result.serialCode ?? result.lotId} (${result.reason})`,
      ...meta,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof ReservationError) {
      return jsonError(err.code, err.message, err.httpStatus);
    }
    // pg_advisory_xact_lock timeout → mapping 409
    const msg = (err as Error).message;
    if (msg && msg.includes("lock_timeout")) {
      return jsonError(
        "ITEM_LOCKED_TRY_AGAIN",
        "Item đang bị lock bởi reservation khác. Vui lòng thử lại sau vài giây.",
        409,
      );
    }
    logger.error({ err }, "reserve failed");
    return jsonError("INTERNAL", "Reserve fail.", 500);
  }
}
