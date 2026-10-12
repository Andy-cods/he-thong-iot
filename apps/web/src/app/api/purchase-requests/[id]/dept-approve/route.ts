import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { deptApprovePR, getPR, getPRLines, PrApprovalError } from "@/server/repos/purchaseRequests";
import { buyQtysSchema } from "@/lib/pr-buy-schema";
import { extractRequestMeta, isDbConcurrencyError, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPRDeptApproved, notifyPRStockCovered } from "@/server/services/notifications";
import { notifyPrAutoFinalized, notifyReadyToIssueIfAny } from "@/server/services/prWarehouseNotify";
import { requireCan } from "@/server/session";
import { isSelfApprovalBlocked, summarizeLineCoverage } from "@/lib/procurement-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  note: z.string().trim().max(2000).optional().nullable(),
  /**
   * Kho kiểm tồn: lineId → SL CẦN MUA (0 ≤ x ≤ SL đề xuất). Bỏ trống → mặc định
   * max(0, đề xuất − tồn khả dụng hiện tại). CHỈ endpoint này và quick-approve
   * (admin) được ghi approved_qty.
   */
  buyQtys: buyQtysSchema.optional(),
});

/**
 * V3.7.69 YCVT — POST /api/purchase-requests/[id]/dept-approve
 * Step 2/3: Trưởng bộ phận duyệt. SUBMITTED → DEPT_APPROVED.
 *
 * Authorization: admin OR warehouse — V4.0 "Trưởng bộ phận" của luồng YCVT là
 * Bộ phận Kho (kiểm tra lượng tồn trước khi duyệt cho mua).
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
  // RBAC action `approve:pr` được dùng cho cả hai cấp, nên route phải khóa
  // thêm đúng vai trò của cấp Trưởng bộ phận.
  //
  // V4.0 — "Trưởng bộ phận" trong luồng YCVT CHÍNH LÀ KHO: Kho kiểm tra lượng
  // tồn thực tế rồi mới duyệt cho mua. Trước đây là `planner` (Thiết kế) —
  // đã gỡ theo quyết định nghiệp vụ của user (đổi cứng, không giữ song song).
  // Admin (Giám đốc) vẫn duyệt được mọi bước nên luồng không thể bị tắc.
  if (
    !guard.session.roles.includes("admin") &&
    !guard.session.roles.includes("warehouse")
  ) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ Admin hoặc Bộ phận Kho (Trưởng bộ phận) được duyệt bước này.",
      403,
    );
  }

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  if (before.approvalStep !== "SUBMITTED") {
    return jsonError(
      "INVALID_STATE",
      `Phiếu đang ở bước ${before.approvalStep} — chỉ duyệt được khi SUBMITTED.`,
      409,
    );
  }

  // V4.1 D8 — người lập phiếu không tự duyệt phiếu của mình (trừ admin).
  if (
    isSelfApprovalBlocked({
      creatorId: before.requestedBy,
      actorId: guard.session.userId,
      actorRoles: guard.session.roles,
    })
  ) {
    return jsonError(
      "SELF_APPROVAL",
      "Bạn là người lập phiếu này — cần người khác duyệt.",
      403,
    );
  }

  const body = await parseJson(req, inputSchema);
  if ("response" in body) return body.response;

  try {
    // L1 — kiểm tồn (đã trừ phần giữ chỗ cho phiếu khác) + ghi trong CÙNG transaction, khoá theo vật tư.
    const row = await deptApprovePR(
      params.id,
      guard.session.userId,
      body.data.note ?? null,
      body.data.buyQtys,
    );
    if (!row) return jsonError("CONFLICT", "Phiếu đã thay đổi trạng thái.", 409);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "APPROVE",
      objectType: "purchase_request",
      objectId: params.id,
      before: { approvalStep: before.approvalStep },
      after: {
        approvalStep: row.approvalStep,
        deptApprovedBy: row.deptApprovedBy,
        buyQtys: row.decisions,
        coveredLines: row.summary.coveredLines,
        buyLines: row.summary.buyLines,
      },
      notes: body.data.note ?? "Trưởng bộ phận duyệt",
      ...meta,
    });

    const prNo = before.paperFormNo ?? before.code;
    if (row.autoFinal) {
      // Kho đáp ứng đủ từ tồn → bỏ qua duyệt cuối: KHÔNG báo người duyệt cuối,
      // báo người lập; báo Kho khác có phiếu cần xuất.
      void notifyPRStockCovered({
        prId: params.id,
        prNo,
        title: before.title ?? null,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.fullName,
        creatorUserId: before.requestedBy,
      });
      if (row.finalized) void notifyPrAutoFinalized(before, guard.session);
      else void notifyReadyToIssueIfAny(params.id, "stock_covered", guard.session);
    } else {
      // Người duyệt cuối nhận kèm tóm tắt "có sẵn X dòng · cần mua Y dòng (Z dòng có sẵn một phần)" (m5).
      const cover = summarizeLineCoverage(await getPRLines(params.id));
      void notifyPRDeptApproved({
        prId: params.id,
        prNo,
        title: before.title ?? null,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.fullName,
        creatorUserId: before.requestedBy,
        coveredLines: cover.coveredLines,
        buyLines: cover.buyLines,
        partialLines: cover.partialLines,
      });
    }

    return NextResponse.json({ data: row });
  } catch (err) {
    if (err instanceof PrApprovalError) return jsonError(err.code, err.message, err.httpStatus);
    if (isDbConcurrencyError(err)) {
      return jsonError("CONFLICT", "Đang có thao tác khác trên phiếu — thử lại.", 409);
    }
    logger.error({ err }, "dept-approve PR failed");
    return jsonError("INTERNAL", "Không duyệt được phiếu.", 500);
  }
}
