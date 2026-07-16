import { NextResponse, type NextRequest } from "next/server";
import { poUpdateSchema } from "@iot/shared";
import { eq } from "drizzle-orm";
import { supplier } from "@iot/db/schema";
import { logger } from "@/lib/logger";
import {
  getPO,
  getPOLines,
  updatePOWithLines,
} from "@/server/repos/purchaseOrders";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit, diffObjects } from "@/server/services/audit";
import { requireCan } from "@/server/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-orders/[id] — detail + lines.
 * PATCH /api/purchase-orders/[id] — V3.4: full edit theo status:
 *   - DRAFT → edit tất cả (header + lines)
 *   - SENT  → chỉ ETA + notes (đã gửi NCC nhưng còn thay đổi ngày được)
 *   - PARTIAL/RECEIVED/CLOSED/CANCELLED → 409 NOT_EDITABLE
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;

  const row = await getPO(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

  const lines = await getPOLines(params.id);

  // V3.11 — join tên/mã NCC (getPO không join supplier) để màn hình chi tiết
  // hết hiện "—" ở ô Nhà cung cấp.
  let supplierName: string | null = null;
  let supplierCode: string | null = null;
  if (row.supplierId) {
    const [sup] = await db
      .select({ name: supplier.name, code: supplier.code })
      .from(supplier)
      .where(eq(supplier.id, row.supplierId))
      .limit(1);
    supplierName = sup?.name ?? null;
    supplierCode = sup?.code ?? null;
  }
  return NextResponse.json({
    data: { ...row, supplierName, supplierCode, lines },
  });
}

const HEADER_ONLY_FIELDS = new Set([
  "expectedEta",
  "actualDeliveryDate",
  "notes",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "po");
  if ("response" in guard) return guard.response;

  const before = await getPO(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

  // Status guard
  const status = before.status as string;
  const isDraft = status === "DRAFT";
  const isSent = status === "SENT";
  if (!isDraft && !isSent) {
    return jsonError(
      "NOT_EDITABLE",
      `PO đang ở trạng thái ${status} — không sửa được.`,
      409,
    );
  }

  const approvalStatus = (
    before.metadata as { approvalStatus?: string } | null
  )?.approvalStatus;
  if (
    isDraft &&
    (approvalStatus === "pending" || approvalStatus === "approved")
  ) {
    return jsonError(
      "NOT_EDITABLE",
      approvalStatus === "pending"
        ? "PO đang chờ duyệt — hãy từ chối trước khi chỉnh sửa."
        : "PO đã duyệt — không thể chỉnh sửa trước khi gửi NCC.",
      409,
    );
  }

  const body = await parseJson(req, poUpdateSchema);
  if ("response" in body) return body.response;

  // SENT chỉ cho update ETA + notes
  if (isSent) {
    const usedFields = Object.keys(body.data).filter(
      (k) => body.data[k as keyof typeof body.data] !== undefined,
    );
    const disallowed = usedFields.filter((f) => !HEADER_ONLY_FIELDS.has(f));
    if (disallowed.length > 0) {
      return jsonError(
        "NOT_EDITABLE",
        `PO đã SENT — chỉ sửa được: ${[...HEADER_ONLY_FIELDS].join(", ")}. Không sửa: ${disallowed.join(", ")}`,
        409,
      );
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.data.expectedEta !== undefined)
    patch.expectedEta = body.data.expectedEta
      ? body.data.expectedEta.toISOString().slice(0, 10)
      : null;
  if (body.data.actualDeliveryDate !== undefined)
    patch.actualDeliveryDate = body.data.actualDeliveryDate
      ? body.data.actualDeliveryDate.toISOString().slice(0, 10)
      : null;
  if (body.data.notes !== undefined) patch.notes = body.data.notes;
  // V3.4 — DRAFT only fields
  if (isDraft) {
    if (body.data.paymentTerms !== undefined)
      patch.paymentTerms = body.data.paymentTerms;
    if (body.data.deliveryAddress !== undefined)
      patch.deliveryAddress = body.data.deliveryAddress;
    if (body.data.supplierId !== undefined)
      patch.supplierId = body.data.supplierId;
  }

  try {
    const result = await updatePOWithLines(
      params.id,
      isDraft ? "DRAFT" : "SENT",
      patch,
      isDraft && body.data.lines
        ? body.data.lines.map((l) => ({
          itemId: l.itemId,
          orderedQty: l.orderedQty,
          unitPrice: l.unitPrice ?? 0,
          taxRate: l.taxRate ?? 8,
          snapshotLineId: l.snapshotLineId ?? null,
          expectedEta: l.expectedEta ? new Date(l.expectedEta) : null,
          notes: l.notes ?? null,
        }))
        : undefined,
    );
    if (!result)
      return jsonError(
        "CONFLICT",
        "PO đã thay đổi trạng thái hoặc trạng thái duyệt.",
        409,
      );
    const after = result.row;
    const newTotalAmount = result.totalAmount;

    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_order",
      objectId: params.id,
      before: diff.before,
      after: {
        ...diff.after,
        ...(body.data.lines
          ? {
              lineCount: body.data.lines.length,
              totalAmount: newTotalAmount,
            }
          : {}),
      },
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err, id: params.id }, "update PO failed");
    return jsonError("INTERNAL", "Không cập nhật được PO.", 500);
  }
}
