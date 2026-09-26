import { NextResponse, type NextRequest } from "next/server";
import { poCancelCloseSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { POTransitionError, closePO } from "@/server/repos/purchaseOrders";
import { markPRGoodsReceived } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { forbidden, hasRole, requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.1 TM-17 — POST /api/purchase-orders/[id]/close `{ reason }`
 *
 * Đóng PO PARTIAL (NCC không giao nốt) hoặc RECEIVED (chốt hồ sơ) → CLOSED.
 * Sau khi đóng không nhận thêm hàng. PR gốc được ghi mốc "Đã nhận hàng" để
 * luồng YCVT đi tiếp. Quyền: Thu mua + Giám đốc.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;
  if (!hasRole(guard.session, "purchaser")) return forbidden();

  const body = await parseJson(req, poCancelCloseSchema);
  if ("response" in body) return body.response;

  try {
    const row = await closePO(params.id, guard.session.userId, body.data.reason);
    const from = (row.metadata as { closedFromStatus?: string } | null)
      ?.closedFromStatus;
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_order",
      objectId: row.id,
      before: { status: from ?? null },
      after: { status: row.status, reason: body.data.reason },
      notes: `Đóng PO: ${body.data.reason}`,
      ...extractRequestMeta(req),
    });
    if (row.prId) void markPRGoodsReceived(row.prId).catch(() => {});
    return NextResponse.json({ data: row });
  } catch (err) {
    if (err instanceof POTransitionError) {
      return jsonError(err.code, err.message, err.status);
    }
    logger.error({ err, id: params.id }, "close PO failed");
    return jsonError("INTERNAL", "Không đóng được PO.", 500);
  }
}
