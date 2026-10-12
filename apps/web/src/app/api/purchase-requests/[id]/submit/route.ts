import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getPR, submitPR } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { canAccessPR, canEditPRDraft } from "@/server/services/prAccess";
import { requireCan } from "@/server/session";
import { REQUEST_REASON_REQUIRED_MSG, isRequestReasonMissing } from "@/lib/procurement-policy";
import { notifyPRSubmitted } from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.69 YCVT — POST /api/purchase-requests/[id]/submit
 * Step 1/3: Người đề xuất submit phiếu. DRAFT → SUBMITTED.
 * Đồng thời sinh paper_form_no `{seq}/PRD-MRF/{MMYY}`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "create", "pr");
  if ("response" in guard) return guard.response;

  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  // V3.9 — ownership: chỉ chủ phiếu (hoặc role xem-tất-cả) mới submit được.
  // Route dùng permission "create" nên operator/qc/warehouse đều qua requireCan;
  // chặn để không submit + đọc phiếu DRAFT của người khác (404, không lộ tồn tại).
  // L5 — nháp của người khác: 404; chỉ người lập (hoặc admin) gửi được nháp.
  if (!canAccessPR(guard.session, before)) {
    return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  }
  if (before.status !== "DRAFT") {
    return jsonError(
      "INVALID_STATE",
      `Phiếu đang ${before.status} — chỉ DRAFT mới submit được.`,
      409,
    );
  }

  if (!canEditPRDraft(guard.session, before)) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ người lập phiếu (hoặc admin) mới gửi được phiếu nháp này.",
      403,
    );
  }

  // A16 — Lý do đề xuất bắt buộc khi gửi (nháp có thể để trống).
  if (isRequestReasonMissing(before.requestReason)) {
    return jsonError("VALIDATION", REQUEST_REASON_REQUIRED_MSG, 422, {
      fields: { requestReason: REQUEST_REASON_REQUIRED_MSG },
    });
  }

  try {
    const row = await submitPR(params.id);
    if (!row) return jsonError("CONFLICT", "Phiếu đã thay đổi trạng thái.", 409);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_request",
      objectId: params.id,
      before: { status: before.status, approvalStep: before.approvalStep ?? "DRAFT" },
      after: {
        status: row.status,
        approvalStep: row.approvalStep,
        paperFormNo: row.paperFormNo,
      },
      notes: `Gửi phiếu YCVT — Số ${row.paperFormNo}`,
      ...meta,
    });

    // V4.1 TM-06 — trước đây gửi phiếu từ DRAFT (VD phiếu tạo từ thiếu hụt)
    // không báo ai → Kho không biết có phiếu chờ duyệt bước 2.
    void notifyPRSubmitted({
      prId: row.id,
      prNo: row.paperFormNo ?? row.code,
      title: row.title ?? null,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.fullName,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "submit PR failed");
    return jsonError("INTERNAL", "Không gửi được phiếu.", 500);
  }
}
