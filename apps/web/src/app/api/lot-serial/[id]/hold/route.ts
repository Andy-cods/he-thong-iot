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
 * POST /api/lot-serial/[id]/hold — V3 warehouse redesign (TASK-20260427-014).
 *
 * Đặt lot vào trạng thái HOLD (vd: QC FAIL, chờ kiểm tra). Update
 * `inventory_lot_serial.status = 'HOLD'` + `hold_reason`.
 *
 * Body: `{ reason: string (3..500) }`.
 * Audit: action=UPDATE, objectType='lot_serial', notes=reason.
 *
 * Guard: chỉ chuyển AVAILABLE/EXPIRED → HOLD. CONSUMED không hold được.
 *
 * RBAC: tạm dùng entity `reservation` (admin+planner+operator có update;
 * warehouse role chưa có quyền update reservation — cần escalate qua
 * permission_override hoặc admin tự handle).
 */

const holdSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Lý do tối thiểu 3 ký tự")
    .max(500, "Tối đa 500 ký tự"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "reservation");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, holdSchema);
  if ("response" in body) return body.response;

  const [before] = await db
    .select()
    .from(inventoryLotSerial)
    .where(eq(inventoryLotSerial.id, params.id))
    .limit(1);

  if (!before) {
    return jsonError("NOT_FOUND", "Không tìm thấy lot.", 404);
  }
  if (before.status === "HOLD") {
    return jsonError("ALREADY_HOLD", "Lot đã ở trạng thái HOLD.", 409);
  }
  if (before.status === "CONSUMED") {
    return jsonError(
      "INVALID_STATE",
      "Lot đã CONSUMED — không thể HOLD.",
      409,
    );
  }

  try {
    const [row] = await db
      .update(inventoryLotSerial)
      .set({ status: "HOLD", holdReason: body.data.reason })
      .where(
        and(
          eq(inventoryLotSerial.id, params.id),
          eq(inventoryLotSerial.status, before.status),
        ),
      )
      .returning();
    if (!row) {
      return jsonError("CONFLICT", "Lot vừa thay đổi trạng thái.", 409);
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "lot_serial",
      objectId: params.id,
      before: { status: before.status, holdReason: before.holdReason },
      after: { status: row.status, holdReason: row.holdReason },
      notes: `HOLD: ${body.data.reason}`,
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
    logger.error({ err, lotId: params.id }, "lot hold failed");
    return jsonError("INTERNAL", "Không đặt được trạng thái HOLD.", 500);
  }
}
