import { NextResponse, type NextRequest } from "next/server";
import { poCreateSchema, poListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { createPO, listPOs } from "@/server/repos/purchaseOrders";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-orders — list PO + filter status[]/supplierId/prId.
 * POST /api/purchase-orders — create manual PO 1 supplier (admin+planner).
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, poListQuerySchema);
  if ("response" in q) return q.response;

  try {
    const result = await listPOs({
      status: q.data.status,
      supplierId: q.data.supplierId,
      prId: q.data.prId,
      bomTemplateId: q.data.bomTemplateId,
      page: q.data.page,
      pageSize: q.data.pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      meta: {
        page: q.data.page,
        pageSize: q.data.pageSize,
        total: result.total,
      },
    });
  } catch (err) {
    logger.error({ err }, "list POs failed");
    return jsonError("INTERNAL", "Lỗi hệ thống khi tải đơn đặt hàng.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "po");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, poCreateSchema);
  if ("response" in body) return body.response;

  try {
    const row = await createPO({
      supplierId: body.data.supplierId,
      linkedOrderId: body.data.linkedOrderId ?? null,
      expectedEta: body.data.expectedEta ?? null,
      currency: body.data.currency,
      notes: body.data.notes ?? null,
      createdBy: guard.session.userId,
      lines: body.data.lines.map((l) => ({
        itemId: l.itemId,
        orderedQty: l.orderedQty,
        unitPrice: l.unitPrice,
        snapshotLineId: l.snapshotLineId ?? null,
        expectedEta: l.expectedEta ?? null,
        notes: l.notes ?? null,
      })),
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "purchase_order",
      objectId: row.id,
      after: {
        poNo: row.poNo,
        supplierId: body.data.supplierId,
        lineCount: body.data.lines.length,
      },
      ...meta,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create PO failed");
    const msg = (err as Error).message ?? "";
    if (msg.includes("PO_MUST_HAVE_LINES")) {
      return jsonError("VALIDATION", "PO phải có ít nhất 1 dòng.", 422);
    }
    return jsonError("INTERNAL", "Không tạo được PO.", 500);
  }
}
