import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getPR, markPRCompleted } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
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

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);

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

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "mark-completed PR failed");
    return jsonError("INTERNAL", "Không cập nhật được trạng thái.", 500);
  }
}
