import { NextResponse, type NextRequest } from "next/server";
import { orderCloseSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { closeOrder, getOrderByCode } from "@/server/repos/orders";
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
 * POST /api/orders/[code]/close — transition order → CLOSED.
 * Chỉ admin + planner. Ghi audit TRANSITION + notes=closeReason.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireCan(req, "transition", "salesOrder");
  if ("response" in guard) return guard.response;

  const before = await getOrderByCode(params.code);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);
  if (before.status === "CLOSED") {
    return jsonError("ALREADY_CLOSED", "Đơn hàng đã được đóng.", 400);
  }
  if (before.status === "CANCELLED") {
    return jsonError(
      "INVALID_STATUS_TRANSITION",
      "Đơn hàng đã huỷ — không thể đóng.",
      409,
    );
  }

  const body = await parseJson(req, orderCloseSchema);
  if ("response" in body) return body.response;

  try {
    const after = await closeOrder(before.id);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "TRANSITION",
      objectType: "sales_order",
      objectId: before.id,
      before: { status: before.status },
      after: { status: "CLOSED" },
      notes: `Đóng đơn: ${body.data.closeReason}`,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err, code: params.code }, "close order failed");
    return jsonError("INTERNAL", "Không đóng được đơn hàng.", 500);
  }
}
