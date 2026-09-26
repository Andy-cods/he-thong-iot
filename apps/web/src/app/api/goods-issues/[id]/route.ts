import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { getGoodsIssue } from "@/server/repos/goodsIssues";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.1 Đợt 1b — GET /api/goods-issues/[id] — chi tiết phiếu xuất kho (header
 * + dòng: mã hàng, lô, bin, SL). RBAC: `read:goodsIssue`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "goodsIssue");
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return jsonError("INVALID_ID", "ID không hợp lệ", 400);
  }

  try {
    const data = await getGoodsIssue(params.id);
    if (!data) return jsonError("NOT_FOUND", "Phiếu xuất kho không tồn tại", 404);
    return NextResponse.json({ data });
  } catch (err) {
    logger.error({ err, id: params.id }, "get goods issue failed");
    return jsonError("GOODS_ISSUE_GET_FAILED", "Không tải được phiếu xuất kho.", 500);
  }
}
