import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getPR, quickApprovePR } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import {
  notifyPRApproved,
  notifyPRApprovedToAccounting,
} from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  note: z.string().trim().max(2000).optional().nullable(),
});

/**
 * V3.9 — POST /api/purchase-requests/[id]/quick-approve
 * Admin duyệt nhanh: gộp 2 cấp (Trưởng bộ phận + Giám đốc) trong 1 request.
 * SUBMITTED → DIRECTOR_APPROVED + status APPROVED. Tên admin hiện ở CẢ 2 ô ký.
 *
 * Chỉ admin — planner/purchaser vẫn duyệt từng cấp (dept → director).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;

  // V3.9 — quick-approve CHỈ admin.
  if (!guard.session.roles.includes("admin")) {
    return jsonError("FORBIDDEN", "Chỉ Admin được duyệt nhanh 2 cấp.", 403);
  }

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  if (before.approvalStep !== "SUBMITTED") {
    return jsonError(
      "INVALID_STATE",
      `Phiếu đang ở bước ${before.approvalStep} — duyệt nhanh chỉ áp dụng khi SUBMITTED.`,
      409,
    );
  }

  const body = await parseJson(req, inputSchema);
  if ("response" in body) return body.response;

  try {
    const row = await quickApprovePR(
      params.id,
      guard.session.userId,
      body.data.note ?? null,
    );
    if (!row) return jsonError("CONFLICT", "Phiếu đã thay đổi trạng thái.", 409);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "APPROVE",
      objectType: "purchase_request",
      objectId: params.id,
      before: { approvalStep: before.approvalStep, status: before.status },
      after: {
        approvalStep: row.approvalStep,
        status: row.status,
        directorApprovedBy: row.directorApprovedBy,
      },
      notes: "Duyệt nhanh 2 cấp (admin)",
      ...meta,
    });

    // Notify creator + Bộ phận Kế toán (kèm link tải PDF/Excel).
    void notifyPRApproved({
      prId: params.id,
      prNo: before.paperFormNo ?? before.code,
      title: before.title ?? null,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
      creatorUserId: before.requestedBy,
    });
    void notifyPRApprovedToAccounting({
      prId: params.id,
      prNo: before.paperFormNo ?? before.code,
      title: before.title ?? null,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "quick-approve PR failed");
    return jsonError("INTERNAL", "Không duyệt nhanh được phiếu.", 500);
  }
}
