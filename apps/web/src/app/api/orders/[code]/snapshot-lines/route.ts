import { NextResponse, type NextRequest } from "next/server";
import { snapshotLineListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getOrderByCode } from "@/server/repos/orders";
import { listSnapshotLines } from "@/server/repos/snapshots";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/orders/[code]/snapshot-lines — list snapshot lines với filter
 * (state[], level, q search SKU/name, shortOnly) + pagination.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireCan(req, "read", "bomSnapshot");
  if ("response" in guard) return guard.response;

  const order = await getOrderByCode(params.code);
  if (!order) return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);

  const q = parseSearchParams(req, snapshotLineListQuerySchema);
  if ("response" in q) return q.response;

  try {
    const result = await listSnapshotLines(order.id, {
      state: q.data.state,
      level: q.data.level,
      shortOnly: q.data.shortOnly,
      q: q.data.q,
      page: q.data.page,
      pageSize: q.data.pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      meta: {
        page: q.data.page,
        pageSize: q.data.pageSize,
        total: result.total,
      },
    });
  } catch (err) {
    logger.error({ err, orderCode: params.code }, "list snapshot-lines failed");
    return jsonError("INTERNAL", "Lỗi khi tải snapshot lines.", 500);
  }
}
