import { NextResponse, type NextRequest } from "next/server";
import { poUpdateSchema } from "@iot/shared";
import { eq } from "drizzle-orm";
import { purchaseOrder } from "@iot/db/schema";
import { logger } from "@/lib/logger";
import {
  getPO,
  getPOLines,
  replacePOLines,
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
  return NextResponse.json({ data: { ...row, lines } });
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
  if (body.data.status !== undefined) patch.status = body.data.status;
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
    let after = before;
    if (Object.keys(patch).length > 0) {
      const [updated] = await db
        .update(purchaseOrder)
        .set(patch)
        .where(eq(purchaseOrder.id, params.id))
        .returning();
      if (!updated) return jsonError("CONFLICT", "PO đã thay đổi.", 409);
      after = updated;
    }

    // V3.4 — replace lines (DRAFT only)
    let newTotalAmount: string | null = null;
    if (isDraft && body.data.lines && body.data.lines.length > 0) {
      const result = await replacePOLines(
        params.id,
        body.data.lines.map((l) => ({
          itemId: l.itemId,
          orderedQty: l.orderedQty,
          unitPrice: l.unitPrice ?? 0,
          taxRate: l.taxRate ?? 8,
          snapshotLineId: l.snapshotLineId ?? null,
          expectedEta: l.expectedEta ? new Date(l.expectedEta) : null,
          notes: l.notes ?? null,
        })),
      );
      newTotalAmount = result.totalAmount;
    }

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
