import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { trendByDay } from "@/lib/shift-output/report";
import { jsonError } from "@/server/http";
import { loadReportRequest } from "@/server/shiftOutputHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/shift-output/reports/trend?from&to — theo ngày: OK, NG, %NG, % khả dụng. */
export async function GET(req: NextRequest) {
  try {
    const r = await loadReportRequest(req);
    if ("response" in r) return r.response;
    return NextResponse.json({ data: trendByDay(r.data.entries, r.query.from, r.query.to) });
  } catch (err) {
    logger.error({ err }, "shift report trend failed");
    return jsonError("INTERNAL", "Lỗi tải xu hướng.", 500);
  }
}
