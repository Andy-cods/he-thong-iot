import { NextResponse, type NextRequest } from "next/server";
import { poApproveSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { approvePO } from "@/server/repos/purchaseOrders";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-orders/[id]/approve
 *
 * V1.9-P9: duyệt PO DRAFT → metadata.approvalStatus = "approved".
 * Role: admin (approve permission).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "po");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, poApproveSchema);
  if ("response" in body) return body.response;

  try {
    const row = await approvePO(
      params.id,
      guard.session.userId,
      body.data.notes ?? null,
    );
    if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "APPROVE",
      objectType: "purchase_order",
      objectId: params.id,
      after: { approvalStatus: "approved", notes: body.data.notes ?? null },
      notes: "Duyệt PO",
      ...meta,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err, id: params.id }, "approve PO failed");
    const msg = (err as Error).message ?? "";
    if (msg.includes("NOT_DRAFT")) {
      return jsonError(
        "INVALID_STATE",
        "Chỉ PO đang DRAFT mới duyệt được.",
        409,
      );
    }
    return jsonError("INTERNAL", "Không duyệt được PO.", 500);
  }
}
