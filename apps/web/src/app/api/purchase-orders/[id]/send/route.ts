import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getPO, sendPO } from "@/server/repos/purchaseOrders";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-orders/[id]/send
 *
 * V1.2 stub: chỉ đánh dấu DRAFT → SENT + timestamp. V1.3 sẽ gửi email qua
 * SMTP service + template PDF. Role: admin only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "po");
  if ("response" in guard) return guard.response;

  const before = await getPO(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);
  if (before.status !== "DRAFT") {
    return jsonError(
      "INVALID_STATE",
      `PO đang ${before.status} — chỉ DRAFT mới gửi được.`,
      409,
    );
  }

  try {
    const row = await sendPO(params.id);
    if (!row) return jsonError("CONFLICT", "PO đã thay đổi trạng thái.", 409);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "POST",
      objectType: "purchase_order",
      objectId: params.id,
      before: { status: "DRAFT" },
      after: { status: "SENT", sentAt: row.sentAt },
      notes: "V1.2 stub: không gửi email, chỉ mark status",
      ...meta,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err, id: params.id }, "send PO failed");
    return jsonError("INTERNAL", "Không gửi được PO.", 500);
  }
}
