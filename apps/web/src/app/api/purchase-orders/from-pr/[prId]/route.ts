import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { createPOFromPR } from "@/server/repos/purchaseOrders";
import {
  extractRequestMeta,
  jsonError,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-orders/from-pr/[prId]
 *
 * Convert PR APPROVED → N PO split theo preferred_supplier_id atomic.
 * Nếu 1 line thiếu supplier → reject toàn bộ (422).
 * Audit CONVERT với danh sách PO ids.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { prId: string } },
) {
  const guard = await requireCan(req, "create", "po");
  if ("response" in guard) return guard.response;

  try {
    const result = await createPOFromPR(params.prId, guard.session.userId);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CONVERT",
      objectType: "purchase_request",
      objectId: params.prId,
      after: {
        poIds: result.createdPOs.map((p) => p.id),
        poNos: result.createdPOs.map((p) => p.poNo),
        linesBySupplier: result.linesBySupplier,
      },
      notes: `Converted → ${result.createdPOs.length} PO`,
      ...meta,
    });

    return NextResponse.json({
      data: {
        createdPOs: result.createdPOs,
        linesBySupplier: result.linesBySupplier,
      },
    });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("PR_NOT_FOUND"))
      return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);
    if (msg.includes("PR_NOT_APPROVED"))
      return jsonError(
        "INVALID_STATE",
        "PR chưa được duyệt — không thể convert PO.",
        409,
      );
    if (msg.includes("MISSING_PREFERRED_SUPPLIER"))
      return jsonError(
        "MISSING_SUPPLIER",
        "Có dòng PR chưa gán nhà cung cấp ưu tiên. Vui lòng sửa PR.",
        422,
      );
    if (msg.includes("PR_EMPTY"))
      return jsonError("VALIDATION", "PR không có dòng nào.", 422);

    logger.error({ err, prId: params.prId }, "convert PR→PO failed");
    return jsonError("INTERNAL", "Không convert được PR sang PO.", 500);
  }
}
