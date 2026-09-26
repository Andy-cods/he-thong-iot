import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { can } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  PoInvoiceError,
  createPoInvoiceDraft,
  financeInvoiceLink,
  getPoInvoiceContext,
  updatePoInvoiceDraft,
} from "@/server/repos/poInvoice";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPoInvoiceDraftCreated } from "@/server/services/notifications";
import { forbidden, requireCan, type Session } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.1 D7 (TM-18) — Hoá đơn mua tạo từ PO.
 *
 *  GET   → { invoice | null, draft, invoiceable, canCreate, canConfirm }
 *  POST  → tạo HĐ NHÁP điền sẵn (PO PARTIAL/RECEIVED/CLOSED). Đã có HĐ chưa huỷ
 *          → 409 PO_INVOICE_EXISTS kèm { invoiceId, invoiceNo, link }.
 *  PATCH → sửa HĐ NHÁP (số HĐ NCC, ngày, hạn TT, tạm tính, VAT, ghi chú);
 *          `confirm: true` → UNPAID (ghi công nợ phải trả).
 *
 * Quyền (không đổi RBAC matrix — tránh xung đột Đợt 3):
 *  - xem: `read:finance` (Kế toán/Giám đốc/Cổ đông… có read:po) hoặc Thu mua
 *  - tạo nháp: `create:finance` (Kế toán, Giám đốc) hoặc Thu mua
 *  - sửa/xác nhận: `update:finance` (Kế toán, Giám đốc)
 */

function canView(s: Session): boolean {
  return can(s.roles, "read", "finance") || s.roles.includes("purchaser");
}
function canCreate(s: Session): boolean {
  return can(s.roles, "create", "finance") || s.roles.includes("purchaser");
}
function canConfirm(s: Session): boolean {
  return can(s.roles, "update", "finance");
}

function errorResponse(err: unknown, fallback: string) {
  if (err instanceof PoInvoiceError) {
    return jsonError(err.code, err.message, err.status, err.details);
  }
  logger.error({ err }, fallback);
  return jsonError("INTERNAL", fallback, 500);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;
  if (!canView(guard.session)) return forbidden();

  try {
    const ctx = await getPoInvoiceContext(params.id);
    if (!ctx) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);
    return NextResponse.json({
      data: {
        ...ctx,
        link: ctx.invoice ? financeInvoiceLink(ctx.invoice.id) : null,
        canCreate: canCreate(guard.session),
        canConfirm: canConfirm(guard.session),
      },
    });
  } catch (err) {
    return errorResponse(err, "Không tải được hoá đơn mua của PO.");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;
  if (!canCreate(guard.session)) return forbidden();

  try {
    const { invoice, poNo } = await createPoInvoiceDraft(
      params.id,
      guard.session.userId,
    );
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "fin_invoice",
      objectId: invoice.id,
      after: invoice,
      notes: `Tạo HĐ mua nháp từ PO ${poNo}`,
      ...extractRequestMeta(req),
    });
    void notifyPoInvoiceDraftCreated({
      poId: params.id,
      poNo,
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      totalAmount: invoice.totalAmount,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
    });
    return NextResponse.json(
      { data: { invoice, link: financeInvoiceLink(invoice.id) } },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err, "Không tạo được hoá đơn mua từ PO.");
  }
}

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày dạng YYYY-MM-DD");

const patchSchema = z
  .object({
    invoiceNo: z.string().trim().min(1, "Bắt buộc").max(64).optional(),
    issueDate: isoDate.optional(),
    dueDate: isoDate.nullable().optional(),
    subtotalAmount: z.coerce.number().min(0).max(1e15).optional(),
    vatRate: z.coerce.number().min(0).max(100).optional(),
    vatAmount: z.coerce.number().min(0).max(1e15).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    confirm: z.boolean().optional(),
  })
  .strict()
  .refine((b) => !(b.dueDate && b.issueDate && b.dueDate < b.issueDate), {
    message: "Hạn thanh toán phải sau ngày hoá đơn.",
    path: ["dueDate"],
  });

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "finance");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, patchSchema);
  if ("response" in body) return body.response;

  try {
    const { before, after } = await updatePoInvoiceDraft(params.id, body.data);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "fin_invoice",
      objectId: after.id,
      before: {
        invoiceNo: before.invoiceNo,
        status: before.status,
        totalAmount: before.totalAmount,
      },
      after: {
        invoiceNo: after.invoiceNo,
        status: after.status,
        totalAmount: after.totalAmount,
      },
      notes: body.data.confirm
        ? `Xác nhận HĐ mua ${after.invoiceNo} — ghi công nợ phải trả`
        : `Sửa HĐ mua nháp ${after.invoiceNo}`,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({
      data: { invoice: after, link: financeInvoiceLink(after.id) },
    });
  } catch (err) {
    return errorResponse(err, "Không cập nhật được hoá đơn mua.");
  }
}
