import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { getStocktakeLines, getStocktakeSession } from "@/server/repos/stocktake";
import { buildStocktakeSheetWorkbook } from "@/server/services/stocktakeExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** V4.3 Việc 2 — GET /api/warehouse/stocktake/[id]/export — xuất phiếu kiểm kê Excel để đếm tay/lưu hồ sơ. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "stocktake");
  if ("response" in guard) return guard.response;

  if (!UUID_RE.test(params.id)) {
    return jsonError("INVALID_ID", "Id phiên kiểm kê không hợp lệ", 400);
  }

  const session = await getStocktakeSession(params.id);
  if (!session) return jsonError("NOT_FOUND", "Không tìm thấy phiên kiểm kê.", 404);

  const lines = await getStocktakeLines(params.id);
  const buf = await buildStocktakeSheetWorkbook(session, lines);
  const filename = `phieu-kiem-ke-${session.code}.xlsx`;

  return new NextResponse(buf as unknown as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
