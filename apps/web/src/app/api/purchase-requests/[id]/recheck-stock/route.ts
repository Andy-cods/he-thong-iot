import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { summarizeLineCoverage } from "@/lib/procurement-policy";
import { getPR, getPRLines, PrApprovalError, recheckPrStock } from "@/server/repos/purchaseRequests";
import { buyQtysSchema } from "@/lib/pr-buy-schema";
import { extractRequestMeta, isDbConcurrencyError, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPRDeptApproved, notifyPRStockCovered } from "@/server/services/notifications";
import { requireCan } from "@/server/session";
import { notifyPoTopUpIfNeeded, notifyPrAutoFinalized, notifyReadyToIssueIfAny } from "@/server/services/prWarehouseNotify";
import { canAccessPR } from "@/server/services/prAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  /** lineId → SL cần mua THÊM (sổ dòng). Bỏ trống → mặc định theo tồn khả dụng hiện tại. */
  addQtys: buyQtysSchema.optional(),
  /** Client cũ gửi SL cần mua tổng — nghĩa đã đổi, không nhận nữa. */
  buyQtys: z.unknown().optional(),
});

/**
 * L1 — POST /api/purchase-requests/[id]/recheck-stock — Kho "Kiểm tồn lại" cho phiếu
 * đã duyệt nhưng chưa hoàn tất và chưa có PO sống (lối thoát cho phiếu bị kẹt vì
 * tồn đã giao cho phiếu khác). SL cần mua tăng → phiếu về chờ duyệt cuối; không
 * tăng → giữ nguyên.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  if (!guard.session.roles.includes("admin") && !guard.session.roles.includes("warehouse")) {
    return jsonError("FORBIDDEN", "Chỉ Admin hoặc Bộ phận Kho được kiểm tồn lại.", 403);
  }
  const before = await getPR(params.id);
  if (!before || !canAccessPR(guard.session, before)) {
    return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  }
  const body = await parseJson(req, inputSchema);
  if ("response" in body) return body.response;
  if (body.data.buyQtys !== undefined) {
    return jsonError(
      "VALIDATION",
      "Hộp thoại Kiểm tồn lại đã đổi sang nhập “SL cần mua thêm” — tải lại trang rồi thử lại.",
      422,
    );
  }

  try {
    const r = await recheckPrStock(params.id, guard.session.userId, body.data.addQtys);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "APPROVE",
      objectType: "purchase_request",
      objectId: params.id,
      before: { approvalStep: before.approvalStep, status: before.status },
      after: {
        approvalStep: r.pr.approvalStep,
        status: r.pr.status,
        increased: r.increased,
        buyQtys: r.decisions,
        addQtys: r.adds,
        coveredLines: r.summary.coveredLines,
        buyLines: r.summary.buyLines,
      },
      notes: r.increased
        ? "Kho kiểm tồn lại: cần mua vượt mức đã duyệt — phiếu về chờ duyệt cuối"
        : r.autoFinal
          ? "Kho kiểm tồn lại: đáp ứng đủ từ tồn — bỏ qua duyệt cuối"
          : "Kho kiểm tồn lại: không phải mua thêm — giữ nguyên",
      ...meta,
    });
    if (r.autoFinal || r.coveredAfterFinal) {
      // L2 — Kiểm tồn lại về 0 khi đang chờ duyệt cuối = "Kho đáp ứng đủ"; N7b — đã duyệt cuối mà nay không
      // còn gì phải lập PO: cũng báo người lập + đóng "Cần tạo PO"/nhắc lập PO (RESOLVES_STALE của PR_STOCK_COVERED).
      void notifyPRStockCovered({
        prId: params.id,
        prNo: before.paperFormNo ?? before.code,
        title: before.title ?? null,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.fullName,
        creatorUserId: before.requestedBy,
      });
    }
    if (r.finalized) void notifyPrAutoFinalized(before, guard.session);
    else if (r.autoFinal || r.coveredAfterFinal) void notifyReadyToIssueIfAny(params.id, "stock_covered", guard.session);
    if (r.reopenedForPo) {
      // Phiếu đã lập PO, PO cũ đóng thiếu: phần còn phải đặt (trong mức đã duyệt) → "Cần tạo PO bổ sung".
      void notifyPoTopUpIfNeeded(params.id, guard.session);
    }
    if (r.increased && r.notifyDeptApproved) {
      const cover = summarizeLineCoverage(await getPRLines(params.id));
      void notifyPRDeptApproved({
        prId: params.id,
        prNo: before.paperFormNo ?? before.code,
        title: before.title ?? null,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.fullName,
        creatorUserId: before.requestedBy,
        coveredLines: cover.coveredLines,
        buyLines: cover.buyLines,
        partialLines: cover.partialLines,
      });
    }
    return NextResponse.json({
      data: {
        increased: r.increased,
        autoFinal: r.autoFinal,
        finalized: r.finalized,
        coveredAfterFinal: r.coveredAfterFinal,
        reopenedForPo: r.reopenedForPo,
        approvalStep: r.pr.approvalStep,
        status: r.pr.status,
      },
    });
  } catch (err) {
    if (err instanceof PrApprovalError) {
      // N8 — lỗi nghiệp vụ: warn, không stack.
      logger.warn({ prId: params.id, code: err.code, detail: err.message }, "recheck-stock PR rejected");
      return jsonError(err.code, err.message, err.httpStatus);
    }
    if (isDbConcurrencyError(err)) {
      return jsonError("CONFLICT", "Đang có thao tác khác trên phiếu — thử lại.", 409);
    }
    logger.error({ err }, "recheck-stock PR failed");
    return jsonError("INTERNAL", "Không kiểm tồn lại được.", 500);
  }
}
