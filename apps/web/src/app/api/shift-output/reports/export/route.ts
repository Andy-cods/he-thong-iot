import { NextResponse, type NextRequest } from "next/server";
import { contentDispositionAttachment } from "@/lib/content-disposition";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { loadReportRequest } from "@/server/shiftOutputHttp";
import { buildShiftOutputWorkbook } from "@/server/services/shiftOutputExcel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/shift-output/reports/export?from&to — Excel 2 sheet "Chi tiết" + "Tổng hợp". */
export async function GET(req: NextRequest) {
  try {
    const r = await loadReportRequest(req);
    if ("response" in r) return r.response;
    const buf = await buildShiftOutputWorkbook({
      siteName: r.site.name,
      from: r.query.from,
      to: r.query.to,
      entries: r.data.entries,
      defects: r.data.defects,
      downtimes: r.data.downtimes,
    });
    const filename = `san-luong-ca-${r.site.code}-${r.query.from}_${r.query.to}.xlsx`;
    return new NextResponse(buf as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDispositionAttachment(filename),
      },
    });
  } catch (err) {
    logger.error({ err }, "shift report export failed");
    return jsonError("INTERNAL", "Lỗi xuất Excel.", 500);
  }
}
