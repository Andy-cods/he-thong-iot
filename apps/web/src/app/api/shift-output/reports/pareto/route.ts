import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { paretoFor } from "@/lib/shift-output/report";
import { jsonError } from "@/server/http";
import { loadReportRequest } from "@/server/shiftOutputHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shift-output/reports/pareto?from&to&type=defect|downtime — Pareto lỗi
 * (theo SL NG) / dừng máy (theo phút); phần chưa gán lý do = "Chưa phân loại".
 */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") === "downtime" ? "downtime" : "defect";
  try {
    const r = await loadReportRequest(req);
    if ("response" in r) return r.response;
    const details = type === "defect" ? r.data.defects : r.data.downtimes;
    return NextResponse.json({ data: { type, ...paretoFor(type, r.data.entries, details) } });
  } catch (err) {
    logger.error({ err }, "shift report pareto failed");
    return jsonError("INTERNAL", "Lỗi tải Pareto.", 500);
  }
}
