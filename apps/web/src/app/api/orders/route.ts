import { NextResponse, type NextRequest } from "next/server";
import { orderCreateSchema, orderListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { createOrder, listOrders } from "@/server/repos/orders";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/orders — list sales orders với filter (q, status[], dateFrom/To,
 * page, pageSize). Search qua `customer_name` / `order_no` (ilike).
 *
 * POST /api/orders — tạo order mới (DRAFT). Code sinh bằng
 * `app.gen_order_code()` SO-YYMM-####. Ghi audit CREATE.
 */
export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, orderListQuerySchema);
  if ("response" in q) return q.response;

  try {
    const dueFrom = q.data.dateFrom ? new Date(q.data.dateFrom) : undefined;
    const dueTo = q.data.dateTo ? new Date(q.data.dateTo) : undefined;
    const result = await listOrders({
      q: q.data.q,
      status: q.data.status,
      dueFrom,
      dueTo,
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
    logger.error({ err }, "list orders failed");
    return jsonError(
      "INTERNAL",
      "Lỗi hệ thống khi tải danh sách đơn hàng.",
      500,
    );
  }
}

export async function POST(req: NextRequest) {
  // Mọi user logged-in tạo được đơn hàng
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, orderCreateSchema);
  if ("response" in body) return body.response;

  try {
    const row = await createOrder({
      customerName: body.data.customerName,
      customerRef: body.data.customerRef ?? null,
      productItemId: body.data.productItemId,
      bomTemplateId: body.data.bomTemplateId ?? null,
      orderQty: body.data.orderQty,
      dueDate: body.data.dueDate ?? null,
      notes: body.data.notes ?? null,
      createdBy: guard.session.userId,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "sales_order",
      objectId: row.id,
      after: { orderNo: row.orderNo, status: row.status, ...body.data },
      notes: `Priority=${body.data.priority}`,
      ...meta,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create order failed");
    return jsonError("INTERNAL", "Không tạo được đơn hàng.", 500);
  }
}
