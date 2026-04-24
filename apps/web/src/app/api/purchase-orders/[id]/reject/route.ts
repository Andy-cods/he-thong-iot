import { NextResponse, type NextRequest } from "next/server";
import { poRejectSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { rejectPO } from "@/server/repos/purchaseOrders";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-orders/[id]/reject
 *
 * V1.9-P9: từ chối duyệt PO DRAFT → metadata.approvalStatus = "rejected" +
 * rejectedReason. Role: admin.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "po");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, poRejectSchema);
  if ("response" in body) return body.response;

  try {
    const row = await rejectPO(
      params.id,
      guard.session.userId,
      body.data.reason,
    );
    if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_order",
      objectId: params.id,
      after: { approvalStatus: "rejected", reason: body.data.reason },
      notes: `Từ chối PO: ${body.data.reason}`,
      ...meta,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err, id: params.id }, "reject PO failed");
    const msg = (err as Error).message ?? "";
    if (msg.includes("NOT_DRAFT")) {
      return jsonError(
        "INVALID_STATE",
        "Chỉ PO đang DRAFT mới từ chối duyệt được.",
        409,
      );
    }
    return jsonError("INTERNAL", "Không từ chối được PO.", 500);
  }
}
