import { NextResponse, type NextRequest } from "next/server";
import { poPriceUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { canEditPoPrices } from "@/lib/procurement-policy";
import { PoPriceError, updatePoLinePrices } from "@/server/repos/poPrices";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPOPriceUpdated } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";

const vnd = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 4 });

/** Ghi chú nhật ký đọc được ngay trong tab Nhật ký của PO (≤ 5 dòng chi tiết). */
function priceAuditNote(
  changes: Array<{ lineNo: number; before: { unitPrice: number; taxRate: number }; after: { unitPrice: number; taxRate: number } }>,
): string {
  const parts = changes.slice(0, 5).map((c) => {
    const price = c.before.unitPrice !== c.after.unitPrice ? ` giá ${vnd(c.before.unitPrice)} → ${vnd(c.after.unitPrice)}` : "";
    const tax = c.before.taxRate !== c.after.taxRate ? ` VAT ${c.before.taxRate}% → ${c.after.taxRate}%` : "";
    return `dòng ${c.lineNo}:${price}${tax}`;
  });
  const more = changes.length > 5 ? `; +${changes.length - 5} dòng khác` : "";
  return `Điều chỉnh giá — ${parts.join("; ")}${more}`;
}
export const dynamic = "force-dynamic";

/**
 * V4.1 PO-UI: PATCH /api/purchase-orders/[id]/prices
 *   body `{ lines: [{ lineId, unitPrice, taxRate }] }`
 *
 * Thu mua / Giám đốc điều chỉnh đơn giá + VAT ở MỌI trạng thái trừ Đã huỷ
 * (giá chốt thường về sau khi nhận hàng). SL / vật tư vẫn chỉ sửa ở DRAFT qua
 * PATCH /api/purchase-orders/[id].
 *  - Kho / Kế hoạch… → 403 PRICE_EDIT_FORBIDDEN
 *  - PO đã huỷ → 409 NOT_EDITABLE
 *  - HĐ mua đã ghi công nợ → 409 PO_INVOICE_POSTED (sửa trên hoá đơn)
 *  - HĐ mua NHÁP → tự tính lại tiền HĐ
 *  - VAT ngoài 0/5/8/10 (trừ giữ nguyên VAT cũ) → 422 INVALID_VAT
 * Ghi audit before/after từng dòng (UPDATE purchase_order, "Điều chỉnh giá").
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "po");
  if ("response" in guard) return guard.response;
  if (!canEditPoPrices(guard.session.roles)) {
    return jsonError(
      "PRICE_EDIT_FORBIDDEN",
      "Chỉ Bộ phận Thu mua hoặc Giám đốc được sửa đơn giá / VAT của PO.",
      403,
    );
  }

  const body = await parseJson(req, poPriceUpdateSchema);
  if ("response" in body) return body.response;

  try {
    const result = await updatePoLinePrices(params.id, body.data.lines);

    if (result.changes.length > 0) {
      await writeAudit({
        actor: guard.session,
        action: "UPDATE",
        objectType: "purchase_order",
        objectId: result.poId,
        before: {
          status: result.status,
          totalAmount: result.totalBefore,
          lines: result.changes.map((c) => ({ lineNo: c.lineNo, lineId: c.lineId, ...c.before })),
          ...(result.invoiceRefreshed
            ? { invoiceTotal: result.invoiceRefreshed.totalBefore }
            : {}),
        },
        after: {
          status: result.status,
          totalAmount: result.totalAfter,
          lines: result.changes.map((c) => ({ lineNo: c.lineNo, lineId: c.lineId, ...c.after })),
          ...(result.invoiceRefreshed
            ? {
                invoiceId: result.invoiceRefreshed.invoiceId,
                invoiceNo: result.invoiceRefreshed.invoiceNo,
                invoiceTotal: result.invoiceRefreshed.totalAfter,
              }
            : {}),
        },
        notes: priceAuditNote(result.changes),
        ...extractRequestMeta(req),
      });
      // Giá đổi SAU khi Giám đốc đã duyệt (DRAFT đã duyệt) hoặc đã gửi NCC trở
      // đi → Kho (đối chiếu nhận hàng) + Giám đốc + Kế toán (HĐ mua nháp tự
      // tính lại). PO nháp chưa duyệt: không báo (chưa ai phụ thuộc giá này).
      const afterApproval =
        result.status !== "DRAFT" || result.approvalStatus === "approved";
      if (afterApproval) {
        void notifyPOPriceUpdated({
          poId: result.poId,
          poNo: result.poNo,
          changedLineCount: result.changes.length,
          afterApproval,
          totalAfter: result.totalAfter,
          invoiceRefreshedNo: result.invoiceRefreshed?.invoiceNo ?? null,
          actorUserId: guard.session.userId,
          actorUsername: guard.session.fullName,
        });
      }
    }

    return NextResponse.json({
      data: {
        changedLines: result.changes.length,
        totalAmount: result.totalAfter,
        invoiceRefreshed: result.invoiceRefreshed,
      },
    });
  } catch (err) {
    if (err instanceof PoPriceError) {
      return jsonError(err.code, err.message, err.status, err.details);
    }
    logger.error({ err, id: params.id }, "update PO prices failed");
    return jsonError("INTERNAL", "Không điều chỉnh được giá PO.", 500);
  }
}
