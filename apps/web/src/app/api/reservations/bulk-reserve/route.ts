import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { bulkReserveOrder } from "@/server/repos/reservations";
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
  snapshotLineIds: z.array(z.string().uuid()).min(1).max(50),
  woId: z.string().uuid().optional(),
});

/**
 * POST /api/reservations/bulk-reserve
 *   Reserve nhiều snapshot lines cùng lúc (partial success).
 *   Role: admin / planner / warehouse.
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "reservation");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  try {
    const result = await bulkReserveOrder(
      body.data.snapshotLineIds,
      guard.session.userId,
      body.data.woId ?? null,
    );

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "RESERVE",
      objectType: "reservation_batch",
      after: {
        successCount: result.successCount,
        failureCount: result.failures.length,
      },
      notes: `Bulk reserve ${body.data.snapshotLineIds.length} lines → ${result.successCount} OK, ${result.failures.length} fail`,
      ...meta,
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (err) {
    logger.error({ err }, "bulk reserve failed");
    return jsonError("INTERNAL", "Bulk reserve fail.", 500);
  }
}
