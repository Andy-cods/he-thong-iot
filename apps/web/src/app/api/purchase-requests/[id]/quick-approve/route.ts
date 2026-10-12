import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getPR, PrApprovalError, quickApprovePR } from "@/server/repos/purchaseRequests";
import { buyQtysSchema } from "@/lib/pr-buy-schema";
import { notifyPrAutoFinalized, notifyReadyToIssueIfAny } from "@/server/services/prWarehouseNotify";
import { extractRequestMeta, isDbConcurrencyError, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import {
  notifyPRApproved,
  notifyPRStockCovered,
} from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  note: z.string().trim().max(2000).optional().nullable(),
  /** lineId → SL cần mua (xem dept-approve). Bỏ trống → mặc định theo tồn khả dụng. */
  buyQtys: buyQtysSchema.optional(),
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

  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

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
    // L1 — kiểm tồn (đã trừ phần giữ chỗ cho phiếu khác) + ghi trong CÙNG transaction, khoá theo vật tư.
    const row = await quickApprovePR(
      params.id,
      guard.session.userId,
      body.data.note ?? null,
      body.data.buyQtys,
    );
    if (!row) return jsonError("CONFLICT", "Phiếu đã thay đổi trạng thái.", 409);
    const summary = row.summary;

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

    if (summary.allCovered) {
      // Không cần mua → không báo Thu mua "Cần tạo PO"; báo người lập.
      void notifyPRStockCovered({
        prId: params.id,
        prNo: before.paperFormNo ?? before.code,
        title: before.title ?? null,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.fullName,
        creatorUserId: before.requestedBy,
      });
    } else {
      // TASK-20260927 — 1 lần gửi: Thu mua (tạo PO) + người lập + Kế toán (PDF).
      void notifyPRApproved({
        prId: params.id,
        prNo: before.paperFormNo ?? before.code,
        title: before.title ?? null,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.fullName,
        creatorUserId: before.requestedBy,
        coveredLines: summary.coveredLines,
        buyLines: summary.buyLines,
      });
    }
    if (row.finalized) void notifyPrAutoFinalized(before, guard.session);
    else {
      void notifyReadyToIssueIfAny(
        params.id,
        summary.allCovered ? "stock_covered" : "approved",
        guard.session,
      );
    }

    return NextResponse.json({ data: row });
  } catch (err) {
    if (err instanceof PrApprovalError) return jsonError(err.code, err.message, err.httpStatus);
    if (isDbConcurrencyError(err)) {
      return jsonError("CONFLICT", "Đang có thao tác khác trên phiếu — thử lại.", 409);
    }
    logger.error({ err }, "quick-approve PR failed");
    return jsonError("INTERNAL", "Không duyệt nhanh được phiếu.", 500);
  }
}
