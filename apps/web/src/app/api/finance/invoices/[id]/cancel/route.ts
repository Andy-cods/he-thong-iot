import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { cancelFinInvoice, getFinInvoiceById } from "@/server/repos/finInvoices";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Huỷ hoá đơn (status→CANCELLED), chỉ khi paidAmount=0. Guard "update" — cùng
 * lý do với transactions/void (xem comment ở đó): accountant KHÔNG có
 * `delete:finance` trong RBAC matrix, huỷ = đổi trạng thái, không phải xoá.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "finance");
  if ("response" in guard) return guard.response;

  const before = await getFinInvoiceById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy hoá đơn.", 404);
  if (before.status === "CANCELLED") {
    return NextResponse.json({ data: before });
  }
  if (Number(before.paidAmount) > 0) {
    return jsonError(
      "FIN_INVOICE_HAS_PAYMENT",
      "Hoá đơn đã có thanh toán, không thể huỷ.",
      409,
    );
  }

  try {
    const after = await cancelFinInvoice(params.id);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy hoá đơn.", 404);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CANCEL",
      objectType: "fin_invoice",
      objectId: params.id,
      before: { status: before.status },
      after: { status: "CANCELLED" },
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "cancel fin invoice failed");
    return jsonError("INTERNAL", "Không huỷ được hoá đơn.", 500);
  }
}
