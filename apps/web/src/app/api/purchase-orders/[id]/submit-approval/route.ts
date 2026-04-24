import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { submitPOForApproval } from "@/server/repos/purchaseOrders";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-orders/[id]/submit-approval
 *
 * V1.9-P9: PO DRAFT đang có metadata.approvalStatus = undefined/null →
 * chuyển sang "pending", ghi submittedBy + submittedAt. Chỉ DRAFT.
 * Role: planner/admin (update permission).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "po");
  if ("response" in guard) return guard.response;

  try {
    const row = await submitPOForApproval(params.id, guard.session.userId);
    if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_order",
      objectId: params.id,
      after: { approvalStatus: "pending" },
      notes: "Gửi duyệt PO",
      ...meta,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err, id: params.id }, "submit PO approval failed");
    const msg = (err as Error).message ?? "";
    if (msg.includes("NOT_DRAFT")) {
      return jsonError(
        "INVALID_STATE",
        "Chỉ PO đang DRAFT mới gửi duyệt được.",
        409,
      );
    }
    return jsonError("INTERNAL", "Không gửi duyệt được PO.", 500);
  }
}
