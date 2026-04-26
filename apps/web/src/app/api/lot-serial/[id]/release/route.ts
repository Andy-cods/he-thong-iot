import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { inventoryLotSerial } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/lot-serial/[id]/release — V3 warehouse redesign (TASK-20260427-014).
 *
 * Giải phóng lot HOLD → AVAILABLE. Body optional `{ note?: string }`.
 *
 * Guard: chỉ chuyển HOLD → AVAILABLE. Lot AVAILABLE/CONSUMED/EXPIRED không
 * release được (409 INVALID_STATE).
 *
 * Audit: action=RELEASE, objectType='lot_serial'.
 */

const releaseSchema = z
  .object({
    note: z.string().trim().max(500).optional().nullable(),
  })
  .partial();

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "reservation");
  if ("response" in guard) return guard.response;

  // Body optional — nếu không có body vẫn parse OK (note undefined).
  const body = await parseJson(req, releaseSchema).catch(() => ({
    data: { note: null },
  }));
  const note =
    "data" in body && body.data && "note" in body.data
      ? (body.data.note ?? null)
      : null;

  const [before] = await db
    .select()
    .from(inventoryLotSerial)
    .where(eq(inventoryLotSerial.id, params.id))
    .limit(1);

  if (!before) {
    return jsonError("NOT_FOUND", "Không tìm thấy lot.", 404);
  }
  if (before.status !== "HOLD") {
    return jsonError(
      "INVALID_STATE",
      `Chỉ release được lot đang HOLD (hiện ${before.status}).`,
      409,
    );
  }

  try {
    const [row] = await db
      .update(inventoryLotSerial)
      .set({ status: "AVAILABLE", holdReason: null })
      .where(
        and(
          eq(inventoryLotSerial.id, params.id),
          eq(inventoryLotSerial.status, "HOLD"),
        ),
      )
      .returning();
    if (!row) {
      return jsonError("CONFLICT", "Lot vừa thay đổi trạng thái.", 409);
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "RELEASE",
      objectType: "lot_serial",
      objectId: params.id,
      before: { status: before.status, holdReason: before.holdReason },
      after: { status: row.status, holdReason: row.holdReason },
      notes: note ?? null,
      ...meta,
    });

    return NextResponse.json({
      ok: true,
      lotSerial: {
        id: row.id,
        status: row.status,
        holdReason: row.holdReason,
        lotCode: row.lotCode,
        serialCode: row.serialCode,
        itemId: row.itemId,
      },
    });
  } catch (err) {
    logger.error({ err, lotId: params.id }, "lot release failed");
    return jsonError("INTERNAL", "Không release được lot.", 500);
  }
}
