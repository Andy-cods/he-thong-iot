import { NextResponse, type NextRequest } from "next/server";
import { finTransactionCreateSchema, finTransactionListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { createTransaction, listFinTransactions } from "@/server/repos/finTransactions";
import { extractRequestMeta, jsonError, parseJson, parseSearchParams } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, finTransactionListQuerySchema);
  if ("response" in q) return q.response;
  const result = await listFinTransactions(q.data);
  return NextResponse.json({
    data: result.rows,
    meta: { page: q.data.page, pageSize: q.data.pageSize, total: result.total },
  });
}

/**
 * Tạo giao dịch thủ công — CHỈ luồng KHÔNG hoá đơn qua payment (invoiceId có
 * thể set, paymentId thì KHÔNG — schema `finTransactionCreateSchema` không có
 * field này nên body dư thừa `paymentId` bị zod bỏ qua tự nhiên; đây là lớp
 * phòng thủ chống double-count §C.2 ở tầng validate).
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "finance");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, finTransactionCreateSchema);
  if ("response" in body) return body.response;

  // Phòng thủ tường minh — nếu client cố tình gửi paymentId trong raw body,
  // chặn ngay tại đây dù zod đã strip field lạ (an toàn kép theo yêu cầu brief).
  const rawBody = (await req.clone().json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (rawBody && "paymentId" in rawBody && rawBody.paymentId) {
    return jsonError(
      "FIN_TRANSACTION_PAYMENT_ID_FORBIDDEN",
      "Không được set paymentId thủ công, dùng API /api/finance/payments.",
      400,
    );
  }

  try {
    const row = await createTransaction(body.data, guard.session.userId);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "fin_transaction",
      objectId: row.id,
      after: row,
      ...meta,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create fin transaction failed");
    return jsonError("INTERNAL", "Không tạo được giao dịch.", 500);
  }
}
