import { NextResponse, type NextRequest } from "next/server";
import { poCancelCloseSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { POTransitionError, cancelPO } from "@/server/repos/purchaseOrders";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPOCancelled } from "@/server/services/notifications";
import { forbidden, hasRole, requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.1 TM-17 — POST /api/purchase-orders/[id]/cancel `{ reason }`
 *
 * Huỷ PO CHƯA nhận hàng (DRAFT/SENT, mọi dòng received = 0) → CANCELLED.
 * PO đã nhận một phần → 409, dùng /close. Quyền: Thu mua + Giám đốc.
 * PO đã gửi NCC bị huỷ → báo Kho thôi chờ hàng.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;
  if (!hasRole(guard.session, "purchaser")) return forbidden();

  const body = await parseJson(req, poCancelCloseSchema);
  if ("response" in body) return body.response;

  try {
    const row = await cancelPO(params.id, guard.session.userId, body.data.reason);
    const stage = (row.metadata as { cancelledStage?: string } | null)
      ?.cancelledStage;
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_order",
      objectId: row.id,
      before: { status: stage ?? null },
      after: { status: row.status, reason: body.data.reason },
      notes: `Huỷ PO: ${body.data.reason}`,
      ...extractRequestMeta(req),
    });
    if (stage === "SENT") {
      void notifyPOCancelled({
        poId: row.id,
        poNo: row.poNo,
        reason: body.data.reason,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.username,
      });
    }
    return NextResponse.json({ data: row });
  } catch (err) {
    if (err instanceof POTransitionError) {
      return jsonError(err.code, err.message, err.status);
    }
    logger.error({ err, id: params.id }, "cancel PO failed");
    return jsonError("INTERNAL", "Không huỷ được PO.", 500);
  }
}
