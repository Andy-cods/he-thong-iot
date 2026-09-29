import { NextResponse, type NextRequest } from "next/server";
import { lookupSku } from "@/server/repos/warehouseLocation";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/warehouse/lookup?q=xxx — tìm SKU/tên → tất cả vị trí + lot + qty.
 *
 * V4.2 audit S-guard — chỉ dùng trong `WarehouseLayoutTab` (trang /warehouse,
 * admin/warehouse) → siết `read:inventory`.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "inventory");
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ data: { matchedItems: [], locations: [] } });
  }

  try {
    const result = await lookupSku(q);
    return NextResponse.json({ data: result });
  } catch (e) {
    return jsonError(
      "WH_LOOKUP_FAILED",
      (e as Error).message ?? "Không tra cứu được",
      500,
    );
  }
}
