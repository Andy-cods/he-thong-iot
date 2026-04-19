import { NextResponse, type NextRequest } from "next/server";
import { prApproveSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { approvePR, getPR } from "@/server/repos/purchaseRequests";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-requests/[id]/approve — admin+planner.
 * DRAFT/SUBMITTED → APPROVED. Audit APPROVE.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);
  if (before.status === "APPROVED") {
    return jsonError("ALREADY_APPROVED", "PR đã được duyệt.", 409);
  }
  if (before.status === "CONVERTED" || before.status === "REJECTED") {
    return jsonError(
      "INVALID_STATE",
      `PR đang ${before.status} — không duyệt được.`,
      409,
    );
  }

  const body = await parseJson(req, prApproveSchema);
  if ("response" in body) return body.response;

  try {
    const row = await approvePR(params.id, guard.session.userId);
    if (!row) return jsonError("CONFLICT", "PR đã thay đổi trạng thái.", 409);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "APPROVE",
      objectType: "purchase_request",
      objectId: params.id,
      before: { status: before.status },
      after: { status: row.status, approvedBy: row.approvedBy },
      notes: body.data.notes ?? null,
      ...meta,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "approve PR failed");
    return jsonError("INTERNAL", "Không duyệt được PR.", 500);
  }
}
