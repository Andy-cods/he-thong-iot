import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { deptApprovePR, getPR } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPRDeptApproved } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  note: z.string().trim().max(2000).optional().nullable(),
});

/**
 * V3.7.69 YCVT — POST /api/purchase-requests/[id]/dept-approve
 * Step 2/3: Trưởng bộ phận duyệt. SUBMITTED → DEPT_APPROVED.
 *
 * Authorization: admin OR planner (role "trưởng bộ phận thiết kế/kế hoạch").
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;
  // RBAC action `approve:pr` được dùng cho cả hai cấp, nên route phải khóa
  // thêm đúng vai trò của cấp Trưởng bộ phận.
  if (
    !guard.session.roles.includes("admin") &&
    !guard.session.roles.includes("planner")
  ) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ Admin hoặc Trưởng bộ phận được duyệt bước này.",
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

  const body = await parseJson(req, inputSchema);
  if ("response" in body) return body.response;

  try {
    const row = await deptApprovePR(
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
      before: { approvalStep: before.approvalStep },
      after: { approvalStep: row.approvalStep, deptApprovedBy: row.deptApprovedBy },
      notes: body.data.note ?? "Trưởng bộ phận duyệt",
      ...meta,
    });

    // V3.7.69 YCVT — bắn notification cho purchaser (chờ duyệt cuối) + creator (báo tiến độ)
    void notifyPRDeptApproved({
      prId: params.id,
      prNo: before.paperFormNo ?? before.code,
      title: before.title ?? null,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
      creatorUserId: before.requestedBy,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "dept-approve PR failed");
    return jsonError("INTERNAL", "Không duyệt được phiếu.", 500);
  }
}
