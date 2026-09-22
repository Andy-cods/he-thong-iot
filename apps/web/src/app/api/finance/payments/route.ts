import { NextResponse, type NextRequest } from "next/server";
import { finPaymentCreateSchema, finPaymentListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { createPaymentWithAllocations, listFinPayments } from "@/server/repos/finPayments";
import { extractRequestMeta, jsonError, parseJson, parseSearchParams } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, finPaymentListQuerySchema);
  if ("response" in q) return q.response;
  const result = await listFinPayments(q.data);
  return NextResponse.json({
    data: result.rows,
    meta: { page: q.data.page, pageSize: q.data.pageSize, total: result.total },
  });
}

/**
 * Tạo đợt thanh toán + allocations trong 1 transaction (xem
 * `createPaymentWithAllocations` — cơ chế chống double-count §C.2). Đây là
 * endpoint DUY NHẤT được phép sinh `fin_transaction` có `paymentId` set.
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "finance");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, finPaymentCreateSchema);
  if ("response" in body) return body.response;

  try {
    const result = await createPaymentWithAllocations(body.data, guard.session.userId);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "fin_payment",
      objectId: result.payment.id,
      after: result,
      ...meta,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("FIN_INVOICE_NOT_FOUND")) {
      return jsonError("FIN_INVOICE_NOT_FOUND", "Hoá đơn không tồn tại.", 404);
    }
    if (message.startsWith("FIN_INVOICE_CANCELLED")) {
      return jsonError("FIN_INVOICE_CANCELLED", "Hoá đơn đã huỷ, không thể thanh toán.", 409);
    }
    if (message.startsWith("FIN_PAYMENT_ALLOCATION_EXCEEDS_REMAINING")) {
      return jsonError(
        "FIN_PAYMENT_ALLOCATION_EXCEEDS_REMAINING",
        "Số tiền phân bổ vượt quá số còn nợ của hoá đơn.",
        409,
      );
    }
    if (message === "FIN_PAYMENT_ALLOCATION_SUM_MISMATCH") {
      return jsonError(
        "FIN_PAYMENT_ALLOCATION_SUM_MISMATCH",
        "Tổng các khoản phân bổ phải bằng totalAmount.",
        422,
      );
    }
    logger.error({ err }, "create fin payment failed");
    return jsonError("INTERNAL", "Không tạo được thanh toán.", 500);
  }
}
