import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getPR, PrApprovalError, recheckPrStock } from "@/server/repos/purchaseRequests";
import { buyQtysSchema } from "@/lib/pr-buy-schema";
import { extractRequestMeta, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPRDeptApproved } from "@/server/services/notifications";
import { requireCan } from "@/server/session";
import { canAccessPR } from "@/server/services/prAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  /** lineId → SL cần mua mới (tính trên phần còn lại = đề xuất − đã xuất). Bỏ trống → theo tồn hiện tại. */
  buyQtys: buyQtysSchema.optional(),
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

  try {
    const r = await recheckPrStock(params.id, guard.session.userId, body.data.buyQtys);
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
        coveredLines: r.summary.coveredLines,
        buyLines: r.summary.buyLines,
      },
      notes: r.increased
        ? "Kho kiểm tồn lại: cần mua thêm — phiếu về chờ duyệt cuối"
        : "Kho kiểm tồn lại: không phải mua thêm — giữ nguyên",
      ...meta,
    });
    if (r.increased) {
      void notifyPRDeptApproved({
        prId: params.id,
        prNo: before.paperFormNo ?? before.code,
        title: before.title ?? null,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.fullName,
        creatorUserId: before.requestedBy,
        coveredLines: r.summary.coveredLines,
        buyLines: r.summary.buyLines,
      });
    }
    return NextResponse.json({
      data: { increased: r.increased, approvalStep: r.pr.approvalStep, status: r.pr.status },
    });
  } catch (err) {
    if (err instanceof PrApprovalError) return jsonError(err.code, err.message, err.httpStatus);
    logger.error({ err }, "recheck-stock PR failed");
    return jsonError("INTERNAL", "Không kiểm tồn lại được.", 500);
  }
}
