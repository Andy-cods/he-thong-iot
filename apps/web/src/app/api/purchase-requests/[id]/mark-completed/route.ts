import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getPR, markPRCompleted } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPRProgress } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.70 YCVT — POST /api/purchase-requests/[id]/mark-completed
 * Timeline IV.5 — "Hoàn tất". Admin đóng phiếu khi toàn bộ flow hoàn tất.
 * Set completedAt + approvalStep=DONE.
 *
 * Idempotent: nếu đã set completedAt → trả 200 với data hiện tại.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;
  // V4.2 audit S-guard — khớp docstring ("Admin đóng phiếu") + UI
  // (canMarkCompleted = isAdmin only), giống cách mark-issued/dept-approve/
  // director-approve tự khoá thêm role trên nền action chung `approve:pr`.
  if (!guard.session.roles.includes("admin")) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ Admin được đóng phiếu (đánh dấu hoàn tất).",
      403,
    );
  }

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);

  // V4.1 TM-13 — trước đây đẩy được cả phiếu đang chờ duyệt sang DONE.
  // Chỉ phiếu đã duyệt cuối / đã lên PO và đã ghi nhận xuất kho (khớp nút UI).
  if (before.status !== "APPROVED" && before.status !== "CONVERTED") {
    return jsonError(
      "INVALID_STATE",
      "Phiếu chưa được duyệt xong — không hoàn tất được.",
      409,
    );
  }
  if (!before.completedAt && !before.goodsIssuedAt) {
    return jsonError(
      "INVALID_STATE",
      "Phiếu chưa ghi nhận “Đã xuất kho” — chưa hoàn tất được.",
      409,
    );
  }

  if (before.completedAt) {
    return NextResponse.json({
      data: before,
      meta: { alreadyMarked: true },
    });
  }

  try {
    const row = await markPRCompleted(params.id);
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
      before: {
        completedAt: null,
        approvalStep: before.approvalStep,
      },
      after: {
        completedAt: row.completedAt,
        approvalStep: row.approvalStep,
      },
      notes: "YCVT timeline IV → Hoàn tất",
      ...meta,
    });

    // TASK-20260927 — báo người lập phiếu mốc tiến độ mới.
    void notifyPRProgress({
      stage: "completed",
      prId: params.id,
      prNo: before.paperFormNo ?? before.code,
      title: before.title ?? null,
      creatorUserId: before.requestedBy,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.fullName,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "mark-completed PR failed");
    return jsonError("INTERNAL", "Không cập nhật được trạng thái.", 500);
  }
}
