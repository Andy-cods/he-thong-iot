import { eq } from "drizzle-orm";
import { finInvoice, purchaseOrder, purchaseOrderLine } from "@iot/db/schema";
import { db } from "@/lib/db";
import {
  isPoInvoiceLockingPrices,
  isPoPriceEditableStatus,
  planPoPriceEdit,
  type PoPriceChange,
  type PoPriceEdit,
} from "../../lib/procurement-policy";
import { findActiveInvoiceForPo, refreshDraftInvoiceAmounts, financeInvoiceLink } from "./poInvoice";

/**
 * V4.1 PO-UI: điều chỉnh đơn giá + VAT dòng PO ở mọi trạng thái trừ Đã huỷ.
 *
 * Giá chốt thường về sau khi nhận hàng / có hoá đơn NCC → Thu mua / Giám đốc
 * sửa giá cả khi PO đã gửi / nhận / đóng. SL + vật tư vẫn chỉ sửa ở DRAFT
 * (PATCH /api/purchase-orders/[id]).
 *
 * Một transaction: khoá PO → khoá HĐ mua (nếu có) → khoá dòng → cập nhật
 * unit_price / tax_rate / line_total từng dòng đổi → total_amount PO → HĐ mua
 * NHÁP tính lại tiền. HĐ đã ghi công nợ → 409 PO_INVOICE_POSTED.
 */

export class PoPriceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface PoPriceUpdateResult {
  poId: string;
  poNo: string;
  status: string;
  changes: PoPriceChange[];
  totalBefore: string;
  totalAfter: string;
  invoiceRefreshed: {
    invoiceId: string;
    invoiceNo: string;
    totalBefore: string;
    totalAfter: string;
  } | null;
}

export async function updatePoLinePrices(
  poId: string,
  edits: readonly PoPriceEdit[],
): Promise<PoPriceUpdateResult> {
  return db.transaction(async (tx) => {
    const [po] = await tx
      .select()
      .from(purchaseOrder)
      .where(eq(purchaseOrder.id, poId))
      .limit(1)
      .for("update");
    if (!po) throw new PoPriceError("NOT_FOUND", "Không tìm thấy PO.", 404);
    if (!isPoPriceEditableStatus(po.status)) {
      throw new PoPriceError("NOT_EDITABLE", "PO đã huỷ — không điều chỉnh giá.");
    }

    // Khoá luôn HĐ mua để Kế toán không "Xác nhận ghi công nợ" chen giữa.
    const active = await findActiveInvoiceForPo(tx, poId);
    const [invoice] = active
      ? await tx
          .select()
          .from(finInvoice)
          .where(eq(finInvoice.id, active.id))
          .limit(1)
          .for("update")
      : [];
    if (invoice && isPoInvoiceLockingPrices(invoice.status)) {
      throw new PoPriceError(
        "PO_INVOICE_POSTED",
        "PO đã có hoá đơn mua đã ghi công nợ — điều chỉnh trên hoá đơn",
        409,
        {
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          status: invoice.status,
          link: financeInvoiceLink(invoice.id),
        },
      );
    }

    const lines = await tx
      .select({
        id: purchaseOrderLine.id,
        lineNo: purchaseOrderLine.lineNo,
        orderedQty: purchaseOrderLine.orderedQty,
        unitPrice: purchaseOrderLine.unitPrice,
        taxRate: purchaseOrderLine.taxRate,
      })
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.poId, poId))
      .orderBy(purchaseOrderLine.lineNo)
      .for("update");

    const plan = planPoPriceEdit(lines, edits);
    if (!plan.ok) {
      throw new PoPriceError(plan.code, plan.message, 422, plan.lineNo ? { lineNo: plan.lineNo } : undefined);
    }

    const base = {
      poId,
      poNo: po.poNo,
      status: po.status,
      changes: plan.changes,
      totalBefore: po.totalAmount,
    };
    if (plan.changes.length === 0) {
      return { ...base, totalAfter: po.totalAmount, invoiceRefreshed: null };
    }

    for (const c of plan.changes) {
      await tx
        .update(purchaseOrderLine)
        .set({
          unitPrice: String(c.after.unitPrice),
          taxRate: String(c.after.taxRate),
          lineTotal: c.after.lineTotal.toFixed(2),
        })
        .where(eq(purchaseOrderLine.id, c.lineId));
    }
    const totalAfter = plan.totalAfter.toFixed(2);
    await tx
      .update(purchaseOrder)
      .set({ totalAmount: totalAfter })
      .where(eq(purchaseOrder.id, poId));

    let invoiceRefreshed: PoPriceUpdateResult["invoiceRefreshed"] = null;
    if (invoice && invoice.status === "DRAFT") {
      const r = await refreshDraftInvoiceAmounts(tx, poId, invoice.id);
      if (r) {
        invoiceRefreshed = {
          invoiceId: r.after.id,
          invoiceNo: r.after.invoiceNo,
          totalBefore: r.before.totalAmount,
          totalAfter: r.after.totalAmount,
        };
      }
    }
    return { ...base, totalAfter, invoiceRefreshed };
  });
}
