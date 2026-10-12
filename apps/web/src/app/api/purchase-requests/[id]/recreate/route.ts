import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import {
  PrValidationError,
  duplicatePRAsDraft,
  getPR,
} from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { canAccessPR, canRecreatePR } from "@/server/services/prAccess";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-requests/[id]/recreate — L6 "Tạo lại từ phiếu này".
 *
 * Phiếu REJECTED/CANCELLED là trạng thái kết thúc (không gửi lại được). Route này
 * sao chép header + dòng sang 1 phiếu DRAFT MỚI của người gọi (người lập phiếu gốc
 * hoặc admin); dòng gắn vật tư đã vô hiệu hoá bị bỏ và trả trong `skippedLines`.
 * Client điều hướng tới form sửa nháp (`?draftId=`).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const src = await getPR(params.id);
  if (!src || !canAccessPR(guard.session, src)) {
    return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  }
  if (src.status !== "REJECTED" && src.status !== "CANCELLED") {
    return jsonError(
      "INVALID_STATE",
      "Chỉ tạo lại được từ phiếu đã bị từ chối hoặc đã huỷ.",
      409,
    );
  }
  if (!canRecreatePR(guard.session, src)) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ người lập phiếu (hoặc admin) mới tạo lại được từ phiếu này.",
      403,
    );
  }

  try {
    const result = await duplicatePRAsDraft(params.id, guard.session.userId);

    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "purchase_request",
      objectId: result.pr.id,
      after: {
        code: result.pr.code,
        status: result.pr.status,
        recreatedFrom: src.code,
        lineCount: result.copiedLines,
        skippedLines: result.skippedLines.length,
      },
      notes: `Tạo lại từ phiếu ${src.paperFormNo ?? src.code}`,
      ...extractRequestMeta(req),
    });

    return NextResponse.json(
      {
        data: result.pr,
        meta: {
          copiedLines: result.copiedLines,
          skippedLines: result.skippedLines,
          sourceCode: src.code,
          formType: result.pr.formType,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof PrValidationError) {
      return jsonError(err.code, err.message, err.status);
    }
    logger.error({ err }, "recreate PR failed");
    return jsonError("INTERNAL", "Không tạo lại được phiếu.", 500);
  }
}
