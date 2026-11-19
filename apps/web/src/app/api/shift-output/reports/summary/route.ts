import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { computeKpis } from "@/lib/shift-output/kpi";
import { REPORT_GROUPS, summarize, type ReportGroup } from "@/lib/shift-output/report";
import { jsonError } from "@/server/http";
import { loadReportRequest } from "@/server/shiftOutputHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shift-output/reports/summary?from&to&group=day-shift|machine|part|operator|shift
 * — bảng tổng hợp theo nhóm + dòng tổng (OK, NG, %NG, % đạt KH, phút dừng, % khả dụng).
 */
export async function GET(req: NextRequest) {
  const group = (req.nextUrl.searchParams.get("group") ?? "day-shift") as ReportGroup;
  if (!REPORT_GROUPS.includes(group)) return jsonError("INVALID_GROUP", "Kiểu báo cáo không hợp lệ.", 422);
  try {
    const r = await loadReportRequest(req);
    if ("response" in r) return r.response;
    return NextResponse.json({
      data: { group, rows: summarize(r.data.entries, group), total: computeKpis(r.data.entries) },
    });
  } catch (err) {
    logger.error({ err }, "shift report summary failed");
    return jsonError("INTERNAL", "Lỗi tải báo cáo.", 500);
  }
}
