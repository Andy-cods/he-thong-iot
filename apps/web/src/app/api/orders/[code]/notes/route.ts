import { NextResponse, type NextRequest } from "next/server";
import { orderProductionNotesSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getOrderByCode, updateProductionNotes } from "@/server/repos/orders";
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
 * V1.9 Phase 3 — PATCH /api/orders/[code]/notes
 * Cập nhật `production_notes` cho order (1 textarea). Audit lưu before/after.
 * RBAC: `update` `salesOrder` (admin/planner).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireCan(req, "update", "salesOrder");
  if ("response" in guard) return guard.response;

  const before = await getOrderByCode(params.code);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);

  const body = await parseJson(req, orderProductionNotesSchema);
  if ("response" in body) return body.response;

  try {
    const after = await updateProductionNotes(
      before.id,
      body.data.productionNotes ?? null,
      guard.session.userId,
    );
    if (!after) {
      return jsonError("INTERNAL", "Không cập nhật được ghi chú.", 500);
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "sales_order",
      objectId: before.id,
      before: { productionNotes: before.productionNotes ?? null },
      after: { productionNotes: after.productionNotes ?? null },
      notes: "Cập nhật ghi chú sản xuất",
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error(
      { err, code: params.code },
      "update production notes failed",
    );
    return jsonError("INTERNAL", "Không cập nhật được ghi chú.", 500);
  }
}
