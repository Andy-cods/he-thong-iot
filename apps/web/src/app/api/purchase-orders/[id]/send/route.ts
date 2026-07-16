import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getPO, sendPO } from "@/server/repos/purchaseOrders";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPOSent } from "@/server/services/notifications";
import { forbidden, hasRole, requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-orders/[id]/send
 *
 * Đánh dấu PO đã duyệt là SENT. Không gửi email tự động.
 * Role: admin hoặc purchaser.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;
  if (!hasRole(guard.session, "purchaser")) return forbidden();

  const before = await getPO(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);
  if (before.status !== "DRAFT") {
    return jsonError(
      "INVALID_STATE",
      `PO đang ${before.status} — chỉ DRAFT mới gửi được.`,
      409,
    );
  }
  const approvalStatus = (
    before.metadata as { approvalStatus?: string } | null
  )?.approvalStatus;
  if (approvalStatus !== "approved") {
    return jsonError(
      "INVALID_APPROVAL_STATE",
      "PO phải được phê duyệt trước khi đánh dấu đã gửi.",
      409,
    );
  }

  try {
    const row = await sendPO(params.id);
    if (!row) return jsonError("CONFLICT", "PO đã thay đổi trạng thái.", 409);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "POST",
      objectType: "purchase_order",
      objectId: params.id,
      before: { status: "DRAFT" },
      after: { status: "SENT", sentAt: row.sentAt },
      notes: "Đánh dấu PO đã gửi; không gửi email tự động",
      ...meta,
    });

    void notifyPOSent({
      poId: params.id,
      poNo: before.poNo,
      supplierName: null, // best-effort, có thể join supplier sau nếu cần
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err, id: params.id }, "send PO failed");
    return jsonError("INTERNAL", "Không đánh dấu gửi được PO.", 500);
  }
}
