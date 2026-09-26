import { NextResponse, type NextRequest } from "next/server";
import { poListQuerySchema } from "@iot/shared";
import { getPOStats } from "@/server/repos/purchaseOrders";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";
import { parseDateParam } from "@/lib/procurement-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-orders/stats — aggregate KPI cho toàn bộ PO khớp filter
 * (không phân trang). Dùng cho KPI cards trong POTab/AccountingTab.
 *
 * Trả về: total, openCount, receivedCount, totalSpend, supplierCount, overdueCount.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, poListQuerySchema);
  if ("response" in q) return q.response;

  // V4.1 TM-25 — ngày sai định dạng → 400 (trước đây 500).
  const url = new URL(req.url);
  const from = parseDateParam(url.searchParams.get("from"));
  const to = parseDateParam(url.searchParams.get("to"));
  if (from === "invalid" || to === "invalid") {
    return jsonError("VALIDATION", "Ngày lọc không hợp lệ (dùng YYYY-MM-DD).", 400);
  }

  try {
    const stats = await getPOStats({
      status: q.data.status,
      supplierId: q.data.supplierId,
      prId: q.data.prId,
      bomTemplateId: q.data.bomTemplateId,
      q: q.data.q,
      from,
      to,
      overdue: q.data.overdue,
    });
    return NextResponse.json({ data: stats });
  } catch (e) {
    return jsonError("PO_STATS_FAILED", (e as Error).message ?? "Không lấy được thống kê PO", 500);
  }
}
