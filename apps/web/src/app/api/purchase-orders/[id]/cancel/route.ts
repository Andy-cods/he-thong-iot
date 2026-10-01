import { NextResponse, type NextRequest } from "next/server";
import { poCancelCloseSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { POTransitionError, cancelPO } from "@/server/repos/purchaseOrders";
import { getPR } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPOCancelled } from "@/server/services/notifications";
import { forbidden, hasRole, requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.1 TM-17 — POST /api/purchase-orders/[id]/cancel `{ reason }`
 *
 * Huỷ PO CHƯA nhận hàng (DRAFT/SENT, mọi dòng received = 0) → CANCELLED.
 * PO đã nhận một phần → 409, dùng /close. Quyền: Thu mua + Giám đốc.
 * Thông báo PO_CANCELLED: người lập PO + người đề xuất PR; PO đã duyệt / đã
 * gửi NCC → thêm Kho (thôi chờ hàng) + Giám đốc (người đã duyệt). PO huỷ
 * được = chưa nhận hàng nên chưa thể có HĐ mua → không báo Kế toán.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;
  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  if (!hasRole(guard.session, "purchaser")) return forbidden();

  const body = await parseJson(req, poCancelCloseSchema);
  if ("response" in body) return body.response;

  try {
    const row = await cancelPO(params.id, guard.session.userId, body.data.reason);
    const stage = (row.metadata as { cancelledStage?: string } | null)
      ?.cancelledStage;
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_order",
      objectId: row.id,
      before: { status: stage ?? null },
      after: { status: row.status, reason: body.data.reason },
      notes: `Huỷ PO: ${body.data.reason}`,
      ...extractRequestMeta(req),
    });
    const approvalStatus = (row.metadata as { approvalStatus?: string } | null)
      ?.approvalStatus;
    const pr = row.prId ? await getPR(row.prId).catch(() => null) : null;
    void notifyPOCancelled({
      poId: row.id,
      poNo: row.poNo,
      reason: body.data.reason,
      wasSent: stage === "SENT",
      wasApproved: approvalStatus === "approved",
      creatorUserId: row.createdBy,
      prId: row.prId,
      prRequesterUserId: pr?.requestedBy ?? null,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.fullName,
    });
    return NextResponse.json({ data: row });
  } catch (err) {
    if (err instanceof POTransitionError) {
      return jsonError(err.code, err.message, err.status);
    }
    logger.error({ err, id: params.id }, "cancel PO failed");
    return jsonError("INTERNAL", "Không huỷ được PO.", 500);
  }
}
