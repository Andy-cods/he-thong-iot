import { NextResponse, type NextRequest } from "next/server";
import {
  getWarehouseStats,
  listBinsWithStock,
} from "@/server/repos/warehouseLocation";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/warehouse/layout — list tất cả bins active + stats summary.
 * Used cho 3D layout map.
 *
 * V4.2 audit S-guard — chỉ admin/warehouse thực sự dùng route này (dialog
 * "Điều chỉnh tồn" trong bom-grid-pro chỉ render cho 2 role này; các trang
 * khác gọi component chung nhưng không hiển thị nút mở dialog cho role khác).
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "inventory");
  if ("response" in guard) return guard.response;

  try {
    const [bins, stats] = await Promise.all([
      listBinsWithStock(),
      getWarehouseStats(),
    ]);
    return NextResponse.json({ data: { bins, stats } });
  } catch (e) {
    return jsonError(
      "WH_LAYOUT_FAILED",
      (e as Error).message ?? "Không lấy được layout kho",
      500,
    );
  }
}
