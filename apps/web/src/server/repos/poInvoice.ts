import { and, eq, ne, sql } from "drizzle-orm";
import { finInvoice, purchaseOrder, supplier } from "@iot/db/schema";
import { db } from "@/lib/db";
import {
  PO_INVOICEABLE_STATUSES,
  buildPoInvoiceDraft,
  vnToday,
  type PoInvoiceDraft,
  type PoInvoiceSourceLine,
} from "../../lib/procurement-policy";

/**
 * V4.1 D7 (TM-18) — HĐ mua (fin_invoice direction=IN) tạo TỪ PO.
 *
 * Quyết định anh Thang: KHÔNG tự sinh HĐ khi nhận hàng. Nút "Tạo HĐ mua từ PO"
 * tạo HĐ NHÁP điền sẵn (NCC, tiền theo SL đã nhận đạt × đơn giá, VAT, liên kết
 * PO); Kế toán nhập số HĐ thật của NCC rồi "Xác nhận" → UNPAID (vào công nợ
 * phải trả). Mỗi PO chỉ 1 HĐ chưa huỷ (khoá PO + unique index 0062).
 *
 * File riêng (không sửa finInvoices.ts) để không đụng Đợt 3 Tài chính.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = Pick<typeof db, "execute">;

export class PoInvoiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export type PoInvoiceRow = typeof finInvoice.$inferSelect;

/** Link mở HĐ ở màn Tài chính (Đợt 3 có thể đọc `invoiceId` để mở sẵn chi tiết). */
export function financeInvoiceLink(invoiceId: string): string {
  return `/sales?tab=fin-cashbook&sub=invoices&invoiceId=${invoiceId}`;
}

async function loadInvoiceLines(
  poId: string,
  exec: Exec,
): Promise<PoInvoiceSourceLine[]> {
  const rows = (await exec.execute(sql`
    SELECT pol.line_no,
           pol.ordered_qty::text  AS ordered_qty,
           pol.received_qty::text AS received_qty,
           COALESCE((
             SELECT SUM(rl.received_qty)
             FROM app.inbound_receipt_line rl
             WHERE rl.po_line_id = pol.id AND rl.qc_status = 'FAIL'
           ), 0)::text AS rejected_qty,
           pol.unit_price::text AS unit_price,
           pol.tax_rate::text   AS tax_rate
    FROM app.purchase_order_line pol
    WHERE pol.po_id = ${poId}
    ORDER BY pol.line_no
  `)) as unknown as Array<{
    line_no: number;
    ordered_qty: string;
    received_qty: string;
    rejected_qty: string;
    unit_price: string;
    tax_rate: string | null;
  }>;
  return rows.map((r) => ({
    lineNo: Number(r.line_no),
    orderedQty: r.ordered_qty,
    receivedQty: r.received_qty,
    rejectedQty: r.rejected_qty,
    unitPrice: r.unit_price,
    taxRate: r.tax_rate,
  }));
}

async function findActiveInvoiceForPo(
  exec: Tx | typeof db,
  poId: string,
): Promise<PoInvoiceRow | null> {
  const [row] = await exec
    .select()
    .from(finInvoice)
    .where(
      and(
        eq(finInvoice.purchaseOrderId, poId),
        eq(finInvoice.direction, "IN"),
        ne(finInvoice.status, "CANCELLED"),
      ),
    )
    .limit(1);
  return row ?? null;
}

function existsError(inv: PoInvoiceRow): PoInvoiceError {
  return new PoInvoiceError(
    "PO_INVOICE_EXISTS",
    `PO này đã có hoá đơn mua ${inv.invoiceNo} (${inv.status === "DRAFT" ? "nháp" : "đã ghi nợ"}) — không tạo thêm.`,
    409,
    {
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo,
      status: inv.status,
      link: financeInvoiceLink(inv.id),
    },
  );
}

export interface PoInvoiceContext {
  po: {
    id: string;
    poNo: string;
    status: string;
    supplierId: string;
    supplierName: string | null;
    paymentTerms: string | null;
    currency: string | null;
  };
  invoiceable: boolean;
  invoice: PoInvoiceRow | null;
  draft: PoInvoiceDraft;
}

/** GET — HĐ hiện có của PO (nếu có) + bản nháp tính sẵn để hiển thị. */
export async function getPoInvoiceContext(poId: string): Promise<PoInvoiceContext | null> {
  const [po] = await db
    .select({
      id: purchaseOrder.id,
      poNo: purchaseOrder.poNo,
      status: purchaseOrder.status,
      supplierId: purchaseOrder.supplierId,
      supplierName: supplier.name,
      paymentTerms: purchaseOrder.paymentTerms,
      currency: purchaseOrder.currency,
    })
    .from(purchaseOrder)
    .leftJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(eq(purchaseOrder.id, poId))
    .limit(1);
  if (!po) return null;
  const [invoice, lines] = await Promise.all([
    findActiveInvoiceForPo(db, poId),
    loadInvoiceLines(poId, db),
  ]);
  return {
    po,
    invoiceable: (PO_INVOICEABLE_STATUSES as readonly string[]).includes(po.status),
    invoice,
    draft: buildPoInvoiceDraft({
      lines,
      paymentTerms: po.paymentTerms,
      today: vnToday(),
    }),
  };
}

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

/**
 * POST — tạo HĐ mua NHÁP từ PO. Khoá PO FOR UPDATE để 2 lần bấm đồng thời
 * không cùng lọt qua kiểm tra "đã có HĐ"; unique index 0062 là chốt cuối.
 */
export async function createPoInvoiceDraft(
  poId: string,
  actorId: string | null,
): Promise<{ invoice: PoInvoiceRow; poNo: string }> {
  try {
    return await db.transaction(async (tx) => {
      const [po] = await tx
        .select()
        .from(purchaseOrder)
        .where(eq(purchaseOrder.id, poId))
        .limit(1)
        .for("update");
      if (!po) throw new PoInvoiceError("NOT_FOUND", "Không tìm thấy PO.", 404);
      if (!(PO_INVOICEABLE_STATUSES as readonly string[]).includes(po.status)) {
        throw new PoInvoiceError(
          "PO_NOT_INVOICEABLE",
          "Chỉ tạo hoá đơn mua cho PO đã nhận hàng (nhận một phần / đủ / đã đóng).",
        );
      }
      const existing = await findActiveInvoiceForPo(tx, poId);
      if (existing) throw existsError(existing);

      const draft = buildPoInvoiceDraft({
        lines: await loadInvoiceLines(poId, tx),
        paymentTerms: po.paymentTerms,
        today: vnToday(),
      });
      if (draft.subtotalAmount <= 0) {
        throw new PoInvoiceError(
          "NOTHING_TO_INVOICE",
          "PO chưa có hàng nhận đạt có đơn giá — chưa tạo được hoá đơn mua.",
        );
      }

      const [invoice] = await tx
        .insert(finInvoice)
        .values({
          // Số HĐ tạm = số PO; Kế toán sửa thành số HĐ của NCC khi xác nhận.
          invoiceNo: po.poNo,
          direction: "IN",
          supplierId: po.supplierId,
          purchaseOrderId: po.id,
          issueDate: draft.issueDate,
          dueDate: draft.dueDate,
          subtotalAmount: draft.subtotalAmount.toFixed(2),
          vatRate: draft.vatRate.toFixed(2),
          vatAmount: draft.vatAmount.toFixed(2),
          totalAmount: draft.totalAmount.toFixed(2),
          status: "DRAFT",
          notes:
            `Tạo từ PO ${po.poNo}` +
            (draft.mixedVat ? " · PO nhiều thuế suất — VAT% là thuế suất bình quân" : ""),
          createdBy: actorId,
        })
        .returning();
      if (!invoice) throw new Error("PO_INVOICE_INSERT_FAILED");
      return { invoice, poNo: po.poNo };
    });
  } catch (err) {
    if (pgCode(err) === "23505") {
      const existing = await findActiveInvoiceForPo(db, poId);
      if (existing) throw existsError(existing);
      throw new PoInvoiceError(
        "INVOICE_NO_DUPLICATE",
        "Số hoá đơn trùng với hoá đơn khác của cùng NCC.",
      );
    }
    throw err;
  }
}

export interface UpdatePoInvoiceInput {
  invoiceNo?: string;
  issueDate?: string;
  dueDate?: string | null;
  subtotalAmount?: number;
  vatRate?: number;
  vatAmount?: number;
  notes?: string | null;
  /** true → DRAFT → UNPAID (hoặc OVERDUE nếu đã quá hạn): ghi công nợ phải trả. */
  confirm?: boolean;
}

/** PATCH — sửa HĐ NHÁP của PO và/hoặc xác nhận ghi công nợ. */
export async function updatePoInvoiceDraft(
  poId: string,
  input: UpdatePoInvoiceInput,
): Promise<{ before: PoInvoiceRow; after: PoInvoiceRow }> {
  try {
    return await db.transaction(async (tx) => {
      const current = await findActiveInvoiceForPo(tx, poId);
      if (!current) {
        throw new PoInvoiceError("NOT_FOUND", "PO chưa có hoá đơn mua.", 404);
      }
      const [inv] = await tx
        .select()
        .from(finInvoice)
        .where(eq(finInvoice.id, current.id))
        .limit(1)
        .for("update");
      if (!inv || inv.status !== "DRAFT") {
        throw new PoInvoiceError(
          "INVOICE_NOT_DRAFT",
          "Hoá đơn đã xác nhận — sửa ở màn Tài chính.",
        );
      }

      const subtotal = input.subtotalAmount ?? Number(inv.subtotalAmount);
      const rate = input.vatRate ?? Number(inv.vatRate);
      const vat =
        input.vatAmount ??
        (input.subtotalAmount !== undefined || input.vatRate !== undefined
          ? Math.round(subtotal * rate) / 100
          : Number(inv.vatAmount));
      const total = Math.round((subtotal + vat) * 100) / 100;
      if (input.confirm && total <= 0) {
        throw new PoInvoiceError("INVALID_AMOUNT", "Tổng tiền hoá đơn phải > 0.", 422);
      }
      const dueDate = input.dueDate !== undefined ? input.dueDate : inv.dueDate;
      const today = vnToday();

      const patch: Partial<typeof finInvoice.$inferInsert> = {
        subtotalAmount: subtotal.toFixed(2),
        vatRate: rate.toFixed(2),
        vatAmount: vat.toFixed(2),
        totalAmount: total.toFixed(2),
        dueDate,
        updatedAt: new Date(),
      };
      if (input.invoiceNo !== undefined) patch.invoiceNo = input.invoiceNo;
      if (input.issueDate !== undefined) patch.issueDate = input.issueDate;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.confirm) {
        patch.status = dueDate && dueDate < today ? "OVERDUE" : "UNPAID";
      }

      const [after] = await tx
        .update(finInvoice)
        .set(patch)
        .where(and(eq(finInvoice.id, inv.id), eq(finInvoice.status, "DRAFT")))
        .returning();
      if (!after) throw new PoInvoiceError("CONFLICT", "Hoá đơn vừa thay đổi.");
      return { before: inv, after };
    });
  } catch (err) {
    if (pgCode(err) === "23505") {
      throw new PoInvoiceError(
        "INVOICE_NO_DUPLICATE",
        "Số hoá đơn trùng với hoá đơn khác của cùng NCC.",
      );
    }
    throw err;
  }
}
