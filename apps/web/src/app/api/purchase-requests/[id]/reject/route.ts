import { NextResponse, type NextRequest } from "next/server";
import { prRejectSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getPR, rejectPR } from "@/server/repos/purchaseRequests";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-requests/[id]/reject — admin+planner.
 * DRAFT/SUBMITTED/APPROVED → REJECTED. Audit CANCEL.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "planner");
  if ("response" in guard) return guard.response;

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);
  if (before.status === "REJECTED") {
    return jsonError("ALREADY_REJECTED", "PR đã bị từ chối.", 409);
  }
  if (before.status === "CONVERTED") {
    return jsonError(
      "INVALID_STATE",
      "PR đã CONVERTED — không thể từ chối.",
      409,
    );
  }

  const body = await parseJson(req, prRejectSchema);
  if ("response" in body) return body.response;

  try {
    const row = await rejectPR(params.id, guard.session.userId, body.data.reason);
    if (!row) return jsonError("CONFLICT", "PR đã thay đổi trạng thái.", 409);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CANCEL",
      objectType: "purchase_request",
      objectId: params.id,
      before: { status: before.status },
      after: { status: row.status },
      notes: body.data.reason,
      ...meta,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "reject PR failed");
    return jsonError("INTERNAL", "Không từ chối được PR.", 500);
  }
}
