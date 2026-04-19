import { NextResponse, type NextRequest } from "next/server";
import { orderUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  getOrderByCode,
  updateOrder,
} from "@/server/repos/orders";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit, diffObjects } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/orders/[code] — detail by order_no (user-friendly URL).
 * PATCH /api/orders/[code] — update metadata (DRAFT only, optimistic lock).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireCan(req, "read", "salesOrder");
  if ("response" in guard) return guard.response;

  const row = await getOrderByCode(params.code);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);

  return NextResponse.json({ data: row });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireCan(req, "update", "salesOrder");
  if ("response" in guard) return guard.response;

  const before = await getOrderByCode(params.code);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);

  const body = await parseJson(req, orderUpdateSchema);
  if ("response" in body) return body.response;

  try {
    const after = await updateOrder(before.id, {
      customerName: body.data.customerName,
      customerRef: body.data.customerRef ?? undefined,
      bomTemplateId: body.data.bomTemplateId ?? undefined,
      orderQty: body.data.orderQty,
      dueDate: body.data.dueDate ?? undefined,
      notes: body.data.notes ?? undefined,
      expectedVersionLock: body.data.expectedVersionLock,
    });

    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "sales_order",
      objectId: before.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("ORDER_VERSION_CONFLICT")) {
      return jsonError(
        "VERSION_CONFLICT",
        "Đơn hàng đã bị sửa bởi người khác. Vui lòng tải lại.",
        409,
      );
    }
    if (msg.includes("ORDER_NOT_EDITABLE")) {
      return jsonError(
        "NOT_EDITABLE",
        "Đơn hàng không còn ở trạng thái Nháp — không thể sửa.",
        409,
      );
    }
    logger.error({ err, code: params.code }, "update order failed");
    return jsonError("INTERNAL", "Không cập nhật được đơn hàng.", 500);
  }
}
