import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { inventoryLotSerial } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { releaseLotReservationsTx } from "@/server/repos/reservations";
import { mapDbGuardError } from "@/server/repos/stockGuard";
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
 *
 * V4.1 Đợt 1a (KHO-12/06):
 *  - RBAC đổi sang `update:qcInspection` (admin, qc, warehouse). Planner
 *    KHÔNG còn HOLD/nhả HOLD lô.
 *  - Ghi `hold_code='MANUAL'` (HOLD thủ công, khác QC_PENDING/QC_FAIL).
 *  - Nhả MỌI reservation ACTIVE của lô trong cùng transaction: lô đang HOLD
 *    không xuất được thì giữ chỗ trên nó làm lệnh SX "tưởng đã có hàng".
 *  - Khoá item → lô (cùng thứ tự với guard xuất kho) để không đua với lượt xuất.
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
  const guard = await requireCan(req, "update", "qcInspection");
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
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.execute(sql`SELECT app.reservation_lock(${before.itemId}::uuid)`);
      const [locked] = await tx
        .select()
        .from(inventoryLotSerial)
        .where(eq(inventoryLotSerial.id, params.id))
        .limit(1)
        .for("update");
      if (!locked || locked.status !== before.status) return null;
      const [updated] = await tx
        .update(inventoryLotSerial)
        .set({
          status: "HOLD",
          holdCode: "MANUAL",
          holdReason: body.data.reason,
        })
        .where(eq(inventoryLotSerial.id, params.id))
        .returning();
      const released = await releaseLotReservationsTx(tx, {
        lotSerialId: params.id,
        userId: guard.session.userId,
        reason: "LOT_HOLD",
      });
      return { row: updated!, released };
    });
    if (!outcome) {
      return jsonError("CONFLICT", "Lot vừa thay đổi trạng thái.", 409);
    }
    const { row, released } = outcome;

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "lot_serial",
      objectId: params.id,
      before: { status: before.status, holdReason: before.holdReason },
      after: {
        status: row.status,
        holdCode: row.holdCode,
        holdReason: row.holdReason,
        releasedReservations: released,
      },
      notes: `HOLD: ${body.data.reason}${released > 0 ? ` · nhả ${released} giữ chỗ` : ""}`,
      ...meta,
    });

    return NextResponse.json({
      ok: true,
      releasedReservations: released,
      lotSerial: {
        id: row.id,
        status: row.status,
        holdReason: row.holdReason,
        holdCode: row.holdCode,
        lotCode: row.lotCode,
        serialCode: row.serialCode,
        itemId: row.itemId,
      },
    });
  } catch (err) {
    const g = mapDbGuardError(err);
    if (g) return jsonError(g.code, g.message, g.status);
    logger.error({ err, lotId: params.id }, "lot hold failed");
    return jsonError("INTERNAL", "Không đặt được trạng thái HOLD.", 500);
  }
}
