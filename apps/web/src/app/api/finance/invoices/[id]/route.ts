import { NextResponse, type NextRequest } from "next/server";
import { finInvoiceUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  getFinInvoiceById,
  getFinInvoiceWithPartner,
  getInvoiceAllocations,
  updateFinInvoice,
} from "@/server/repos/finInvoices";
import { getFinPaymentById } from "@/server/repos/finPayments";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { diffObjects, writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chi tiết hoá đơn + lịch sử allocation (join fin_payment_allocation + fin_payment). */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  // V4.1 TC-03 — kèm `supplierName` để UI không tra danh sách NCC.
  const row = await getFinInvoiceWithPartner(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy hoá đơn.", 404);

  const allocations = await getInvoiceAllocations(params.id);
  const paymentIds = [...new Set(allocations.map((a) => a.paymentId))];
  const payments = await Promise.all(paymentIds.map((id) => getFinPaymentById(id)));
  const paymentMap = new Map(payments.filter(Boolean).map((p) => [p!.id, p]));

  return NextResponse.json({
    data: {
      ...row,
      allocations: allocations.map((a) => ({
        ...a,
        payment: paymentMap.get(a.paymentId) ?? null,
      })),
    },
  });
}

/** Sửa hoá đơn — chặn sửa nếu đã có allocation > 0, trừ notes/attachmentUrl. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "finance");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, finInvoiceUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getFinInvoiceById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy hoá đơn.", 404);
  if (before.status === "CANCELLED") {
    return jsonError("FIN_INVOICE_CANCELLED", "Hoá đơn đã huỷ, không thể sửa.", 409);
  }
  try {
    const after = await updateFinInvoice(params.id, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy hoá đơn.", 404);
    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "fin_invoice",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update fin invoice failed");
    return jsonError("INTERNAL", "Không cập nhật được hoá đơn.", 500);
  }
}
