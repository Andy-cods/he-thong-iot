import { NextResponse, type NextRequest } from "next/server";
import { getWarehouseTodaySummary } from "@/server/repos/warehouseToday";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.3 mục 3 — GET /api/warehouse/today — tổng hợp tab "Việc cần làm hôm nay":
 * lô chờ xếp kệ, yêu cầu xuất chờ duyệt (ISR + PR), PO sắp về/quá hạn ETA,
 * dòng chờ QC. Chỉ đọc, gộp các API/đếm đã có sẵn. RBAC `read:inventory`.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "inventory");
  if ("response" in guard) return guard.response;

  try {
    const data = await getWarehouseTodaySummary();
    return NextResponse.json({ data });
  } catch (e) {
    return jsonError(
      "WAREHOUSE_TODAY_FAILED",
      (e as Error).message ?? "Không lấy được dữ liệu 'Việc cần làm hôm nay'",
      500,
    );
  }
}
