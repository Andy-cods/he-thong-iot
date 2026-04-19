import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getOrderByCode } from "@/server/repos/orders";
import { getSnapshotSummary } from "@/server/repos/snapshots";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/snapshots/summary/[orderCode] — aggregate count per state
 * (cho Snapshot Board header badges).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { orderCode: string } },
) {
  const guard = await requireCan(req, "read", "bomSnapshot");
  if ("response" in guard) return guard.response;

  const order = await getOrderByCode(params.orderCode);
  if (!order) return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);

  try {
    const rows = await getSnapshotSummary(order.id);
    const total = rows.reduce((acc, r) => acc + r.count, 0);
    return NextResponse.json({
      data: {
        orderId: order.id,
        orderCode: params.orderCode,
        total,
        byState: rows,
      },
    });
  } catch (err) {
    logger.error(
      { err, orderCode: params.orderCode },
      "snapshot summary failed",
    );
    return jsonError("INTERNAL", "Lỗi khi tải summary snapshot.", 500);
  }
}
