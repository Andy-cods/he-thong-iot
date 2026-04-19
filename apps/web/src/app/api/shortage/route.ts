import { NextResponse, type NextRequest } from "next/server";
import { shortageFilterSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  getShortageByItem,
  refreshAggregate,
} from "@/server/repos/shortage";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shortage — aggregate shortage by item (materialized view).
 *   Query: ?itemId[]?supplierId[]&orderId&minShortQty&limit
 * POST /api/shortage (action=refresh) — manual refresh MV (admin+planner).
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "bomSnapshot");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, shortageFilterSchema);
  if ("response" in q) return q.response;

  try {
    const rows = await getShortageByItem(q.data.limit);
    // Filter in-memory nếu có filter (V1.2 MV nhỏ, MV tăng > 1000 thì move SQL)
    const filtered = rows.filter((r) => {
      if (q.data.minShortQty !== undefined && r.totalShort < q.data.minShortQty)
        return false;
      if (q.data.itemId && q.data.itemId.length > 0) {
        if (!q.data.itemId.includes(r.componentItemId)) return false;
      }
      if (q.data.q && q.data.q.trim()) {
        const needle = q.data.q.toLowerCase();
        if (
          !r.componentSku.toLowerCase().includes(needle) &&
          !r.componentName.toLowerCase().includes(needle)
        )
          return false;
      }
      return true;
    });

    return NextResponse.json({
      data: filtered,
      meta: { total: filtered.length, source: "mv_shortage_aggregate" },
    });
  } catch (err) {
    logger.error({ err }, "shortage list failed");
    return jsonError("INTERNAL", "Lỗi tải shortage board.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "transition", "bomSnapshot");
  if ("response" in guard) return guard.response;

  try {
    await refreshAggregate();
    return NextResponse.json({
      data: { refreshed: true, at: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err }, "shortage refresh failed");
    return jsonError("INTERNAL", "Không refresh được view.", 500);
  }
}
