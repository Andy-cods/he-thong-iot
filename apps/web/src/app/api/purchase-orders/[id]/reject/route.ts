import { NextResponse, type NextRequest } from "next/server";
import { poRejectSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { rejectPO } from "@/server/repos/purchaseOrders";
import { getPR } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPOApprovalRejected } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-orders/[id]/reject
 *
 * V1.9-P9: từ chối duyệt PO DRAFT → metadata.approvalStatus = "rejected" +
 * rejectedReason. Role: admin.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "po");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, poRejectSchema);
  if ("response" in body) return body.response;

  try {
    const row = await rejectPO(
      params.id,
      guard.session.userId,
      body.data.reason,
    );
    if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_order",
      objectId: params.id,
      after: { approvalStatus: "rejected", reason: body.data.reason },
      notes: `Từ chối PO: ${body.data.reason}`,
      ...meta,
    });

    // V4.0 Wave 3 Phase C — bổ sung notify còn thiếu (trước đây route này
    // không bắn notify gì): purchaser + người đề xuất PR gốc.
    const pr = row.prId ? await getPR(row.prId) : null;
    void notifyPOApprovalRejected({
      poId: row.id,
      poNo: row.poNo,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
      prRequesterUserId: pr?.requestedBy ?? null,
      reason: body.data.reason,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err, id: params.id }, "reject PO failed");
    const msg = (err as Error).message ?? "";
    if (msg.includes("NOT_PENDING")) {
      return jsonError(
        "INVALID_STATE",
        "Chỉ PO đang chờ duyệt mới được từ chối.",
        409,
      );
    }
    return jsonError("INTERNAL", "Không từ chối được PO.", 500);
  }
}
