import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getOrderByCode, reopenOrder } from "@/server/repos/orders";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/orders/[code]/reopen — transition CLOSED → IN_PROGRESS.
 * Admin only (đây là recovery action, rare).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireSession(req, "admin");
  if ("response" in guard) return guard.response;

  const before = await getOrderByCode(params.code);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);
  if (before.status !== "CLOSED") {
    return jsonError(
      "INVALID_STATUS_TRANSITION",
      "Chỉ có thể mở lại đơn hàng đã đóng.",
      409,
    );
  }

  try {
    const after = await reopenOrder(before.id);
    if (!after) {
      return jsonError(
        "REOPEN_FAILED",
        "Không mở lại được đơn hàng (status đã đổi).",
        409,
      );
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "TRANSITION",
      objectType: "sales_order",
      objectId: before.id,
      before: { status: "CLOSED" },
      after: { status: after.status },
      notes: "Mở lại đơn hàng đã đóng",
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err, code: params.code }, "reopen order failed");
    return jsonError("INTERNAL", "Không mở lại được đơn hàng.", 500);
  }
}
