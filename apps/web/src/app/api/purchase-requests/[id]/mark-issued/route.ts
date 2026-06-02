import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getPR, markPRGoodsIssued } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.70 YCVT — POST /api/purchase-requests/[id]/mark-issued
 * Timeline IV.4 — "Đã xuất kho". Admin/warehouse đánh dấu khi vật tư đã được
 * issue từ kho cho bộ phận yêu cầu.
 *
 * Idempotent: nếu đã set goods_issued_at → trả 200 với data hiện tại.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);

  if (before.goodsIssuedAt) {
    return NextResponse.json({
      data: before,
      meta: { alreadyMarked: true },
    });
  }

  try {
    const row = await markPRGoodsIssued(params.id);
    if (!row) {
      return NextResponse.json({
        data: before,
        meta: { alreadyMarked: true },
      });
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_request",
      objectId: params.id,
      before: { goodsIssuedAt: null },
      after: { goodsIssuedAt: row.goodsIssuedAt },
      notes: "YCVT timeline IV → Đã xuất kho",
      ...meta,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "mark-issued PR failed");
    return jsonError("INTERNAL", "Không cập nhật được trạng thái.", 500);
  }
}
