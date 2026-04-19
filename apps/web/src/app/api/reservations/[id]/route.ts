import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  ReservationError,
  releaseReservation,
} from "@/server/repos/reservations";
import {
  extractRequestMeta,
  jsonError,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deleteSchema = z.object({
  reason: z.string().max(500).optional(),
});

/** DELETE /api/reservations/[id] — release reservation ACTIVE. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "admin", "planner", "warehouse");
  if ("response" in guard) return guard.response;

  // DELETE có thể không có body — parse best-effort
  const raw = await req.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(raw);
  const reason = parsed.success ? parsed.data.reason : undefined;

  try {
    const released = await releaseReservation(
      params.id,
      guard.session.userId,
      reason ?? null,
    );
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "RESERVE",
      objectType: "reservation",
      objectId: params.id,
      after: { status: released.status, releasedAt: released.releasedAt },
      notes: `RELEASE: ${reason ?? "no reason"}`,
      ...meta,
    });
    return NextResponse.json({ data: released });
  } catch (err) {
    if (err instanceof ReservationError) {
      return jsonError(err.code, err.message, err.httpStatus);
    }
    logger.error({ err, id: params.id }, "release reservation failed");
    return jsonError("INTERNAL", "Release reservation fail.", 500);
  }
}

