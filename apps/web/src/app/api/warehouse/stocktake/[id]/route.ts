import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import {
  getStocktakeLines,
  getStocktakeSession,
  listTxnSinceSnapshot,
  summarizeStocktakeVariance,
} from "@/server/repos/stocktake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * V4.3 Việc 2 — GET /api/warehouse/stocktake/[id]
 *
 * Chi tiết 1 phiên: header + toàn bộ dòng đếm + tổng hợp chênh lệch (màn
 * duyệt dùng `variance`) + cảnh báo giao dịch mới phát sinh sau thời điểm
 * chụp trên các bin thuộc phiên (mục 2 đề bài — không phải thất thoát).
 */
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

  const [lines, txnWarnings] = await Promise.all([
    getStocktakeLines(params.id),
    listTxnSinceSnapshot(params.id),
  ]);

  const variance = summarizeStocktakeVariance(
    lines.map((l) => ({
      lineId: l.id,
      bookQty: l.bookQty,
      countedQty: l.countedQty,
      diffQty: 0,
      unitPrice: l.unitPrice,
    })),
  );

  return NextResponse.json({ data: { session, lines, variance, txnWarnings } });
}
