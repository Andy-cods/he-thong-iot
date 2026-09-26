import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import {
  getFinPaymentById,
  getPaymentAllocations,
  voidPaymentWithAllocations,
} from "@/server/repos/finPayments";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chi tiết payment + allocation breakdown. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const row = await getFinPaymentById(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy thanh toán.", 404);
  const allocations = await getPaymentAllocations(params.id);
  return NextResponse.json({ data: { ...row, allocations } });
}

/**
 * Huỷ payment: rollback allocations + recalc invoice + void transaction liên
 * quan (xem `voidPaymentWithAllocations`). Guard "update" — cùng lý do với
 * transactions/void (accountant không có `delete:finance`).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "finance");
  if ("response" in guard) return guard.response;

  const before = await getFinPaymentById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy thanh toán.", 404);
  // V4.1 TC-06 — đợt thanh toán đã huỷ.
  if (before.status === "VOID") {
    return jsonError("FIN_PAYMENT_ALREADY_VOID", "Đợt thanh toán này đã huỷ trước đó.", 409);
  }

  try {
    const result = await voidPaymentWithAllocations(params.id);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CANCEL",
      objectType: "fin_payment",
      objectId: params.id,
      before,
      after: result,
      notes: "huỷ payment: rollback allocations + void transactions",
      ...meta,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof Error && err.message === "FIN_PAYMENT_ALREADY_VOID") {
      return jsonError("FIN_PAYMENT_ALREADY_VOID", "Đợt thanh toán này đã huỷ trước đó.", 409);
    }
    logger.error({ err }, "void fin payment failed");
    return jsonError("INTERNAL", "Không huỷ được thanh toán.", 500);
  }
}
