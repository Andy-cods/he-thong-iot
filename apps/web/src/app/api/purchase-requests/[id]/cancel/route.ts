import { NextResponse, type NextRequest } from "next/server";
import { prCancelSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { canCancelPR } from "@/lib/procurement-policy";
import { PrCancelError, cancelPR, getPR } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { requireSession } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyPRCancelled } from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-requests/[id]/cancel — V4.4 (Việc 4).
 *
 * Khác `/reject` (chỉ người DUYỆT được từ chối phiếu đang chờ xử lý): huỷ là
 * hành động của NGƯỜI TẠO (khi phiếu còn DRAFT/SUBMITTED, tự rút lại) hoặc
 * ADMIN (khi phiếu đã duyệt xong — APPROVED — nhưng chưa có PO, dừng trước
 * khi phát sinh nghĩa vụ mua hàng). Guard theo NGHIỆP VỤ (không dùng RBAC
 * matrix action riêng — tương tự `canSubmit` ở trang chi tiết PR: creator
 * luôn được thao tác phiếu CHƯA duyệt xong của chính mình bất kể role).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);

  const isCreator = before.requestedBy === guard.session.userId;
  const allowed = canCancelPR({
    status: before.status,
    creatorId: before.requestedBy,
    actorId: guard.session.userId,
    actorRoles: guard.session.roles,
  });
  if (!allowed) {
    return jsonError(
      "FORBIDDEN",
      before.status === "APPROVED"
        ? "Phiếu đã duyệt xong — chỉ Giám đốc (admin) được huỷ."
        : "Chỉ người lập phiếu (khi còn Nháp/Chờ duyệt) hoặc admin mới huỷ được.",
      403,
    );
  }

  const body = await parseJson(req, prCancelSchema);
  if ("response" in body) return body.response;

  try {
    const row = await cancelPR(params.id, guard.session.userId, body.data.reason);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CANCEL",
      objectType: "purchase_request",
      objectId: params.id,
      before: { status: before.status, approvalStep: before.approvalStep },
      after: { status: row.status },
      notes: body.data.reason,
      ...meta,
    });

    // V4.4 — phiếu đã huỷ, mọi nhắc duyệt/chờ duyệt trước đó không còn ý
    // nghĩa: `notifyPRCancelled` → `dispatchNotification` tự gọi
    // `resolveStaleNotifications` theo bảng `RESOLVES_STALE[PR_CANCELLED]`
    // (nhánh thông báo v4.4 mới gộp) — không cần tự đánh dấu đã đọc thủ công.
    void notifyPRCancelled({
      prId: params.id,
      prNo: before.paperFormNo ?? before.code,
      title: before.title ?? null,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
      creatorUserId: before.requestedBy,
      reason: body.data.reason,
      byCreator: isCreator,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    if (err instanceof PrCancelError) {
      return jsonError(err.code, err.message, err.status);
    }
    logger.error({ err }, "cancel PR failed");
    return jsonError("INTERNAL", "Không huỷ được PR.", 500);
  }
}
