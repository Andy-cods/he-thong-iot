import { NextResponse, type NextRequest } from "next/server";
import { poUpdateSchema } from "@iot/shared";
import { eq, inArray } from "drizzle-orm";
import { purchaseRequest, supplier, userAccount } from "@iot/db/schema";
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
import { notifyPOPriceUpdated } from "@/server/services/notifications";
import { requireCan } from "@/server/session";
import { db } from "@/lib/db";
import { canEditPoPrices, detectPoPriceChanges } from "@/lib/procurement-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-orders/[id] — detail + lines.
 * PATCH /api/purchase-orders/[id] — V3.4: full edit theo status:
 *   - DRAFT → edit tất cả (header + lines)
 *   - SENT  → chỉ ETA + notes (đã gửi NCC nhưng còn thay đổi ngày được)
 *   - PARTIAL/RECEIVED/CLOSED/CANCELLED → 409 NOT_EDITABLE
 *   (V4.1 PO-UI: đơn giá / VAT sau DRAFT → PATCH /api/purchase-orders/[id]/prices)
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
  // V4.1 PO-UI: liên hệ NCC + mã PR nguồn cho khung "Thông tin" gọn.
  let supplierContact: { name: string | null; phone: string | null; email: string | null } | null = null;
  if (row.supplierId) {
    const [sup] = await db
      .select({
        name: supplier.name,
        code: supplier.code,
        contactName: supplier.contactName,
        phone: supplier.phone,
        email: supplier.email,
      })
      .from(supplier)
      .where(eq(supplier.id, row.supplierId))
      .limit(1);
    supplierName = sup?.name ?? null;
    supplierCode = sup?.code ?? null;
    if (sup && (sup.contactName || sup.phone || sup.email)) {
      supplierContact = { name: sup.contactName, phone: sup.phone, email: sup.email };
    }
  }
  let prCode: string | null = null;
  if (row.prId) {
    const [pr] = await db
      .select({ code: purchaseRequest.code })
      .from(purchaseRequest)
      .where(eq(purchaseRequest.id, row.prId))
      .limit(1);
    prCode = pr?.code ?? null;
  }
  // V4.1 UI-28 (Đợt 6C): tên người gửi duyệt / duyệt / từ chối — timeline phê
  // duyệt từng hiện UUID "af584041…". 1 truy vấn nhỏ theo ≤3 id trong metadata.
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const actorIds = Array.from(
    new Set(
      // V4.1 PO-UI: + người đóng / huỷ cho khung Tiến trình.
      [meta.submittedBy, meta.approvedBy, meta.rejectedBy, meta.closedBy, meta.cancelledBy].filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      ),
    ),
  );
  const actorNames: Record<string, string> = {};
  if (actorIds.length > 0) {
    try {
      const users = await db
        .select({ id: userAccount.id, fullName: userAccount.fullName, username: userAccount.username })
        .from(userAccount)
        .where(inArray(userAccount.id, actorIds));
      for (const u of users) actorNames[u.id] = u.fullName || u.username;
    } catch (err) {
      // id không phải UUID hợp lệ (dữ liệu cũ) → bỏ qua, FE tự rút gọn id.
      logger.warn({ err, poId: params.id }, "PO actorNames lookup failed");
    }
  }
  return NextResponse.json({
    data: { ...row, supplierName, supplierCode, supplierContact, prCode, lines, actorNames },
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

  // V4.0 Wave 3 Phase C — snapshot giá TRƯỚC khi update để phát hiện đổi giá
  // (chỉ có thể xảy ra khi isDraft, vì SENT không cho sửa lines — HEADER_ONLY_FIELDS
  // đã chặn ở trên). Dùng để quyết định có bắn notifyPOPriceUpdated hay không.
  const beforeLinesForPriceDiff =
    isDraft && body.data.lines ? await getPOLines(params.id) : null;

  // V4.1 D8 (TM-19) — chỉ Thu mua / Giám đốc được đổi đơn giá hoặc VAT
  // (Kho + vai trò khác có `update:po` chỉ sửa SL/ETA/ghi chú).
  if (
    beforeLinesForPriceDiff &&
    body.data.lines &&
    !canEditPoPrices(guard.session.roles)
  ) {
    const diff = detectPoPriceChanges(beforeLinesForPriceDiff, body.data.lines);
    if (diff.changed > 0 || diff.added > 0) {
      return jsonError(
        "PRICE_EDIT_FORBIDDEN",
        "Chỉ Bộ phận Thu mua hoặc Giám đốc được sửa đơn giá / VAT của PO.",
        403,
      );
    }
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
          // V4.1 TM-03 — giữ quy cách DNVT.
          spec: l.spec ?? null,
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

    // V4.0 Wave 3 Phase C — báo Kho nếu đơn giá dòng nào đó thực sự đổi (so
    // sánh theo itemId — line bị xoá-tạo lại nên không còn id cũ để match).
    // KHÔNG báo khi chỉ đổi qty/eta/notes (không ảnh hưởng tồn kho dự kiến).
    if (beforeLinesForPriceDiff && body.data.lines) {
      const beforeByItem = new Map(
        beforeLinesForPriceDiff.map((l) => [l.itemId, Number(l.unitPrice)]),
      );
      const changedLineCount = body.data.lines.filter((l) => {
        const beforePrice = beforeByItem.get(l.itemId);
        const afterPrice = l.unitPrice ?? 0;
        return beforePrice !== undefined && beforePrice !== afterPrice;
      }).length;
      if (changedLineCount > 0) {
        void notifyPOPriceUpdated({
          poId: params.id,
          poNo: after.poNo,
          changedLineCount,
          // PATCH chỉ sửa được PO nháp CHƯA gửi duyệt/bị từ chối → chỉ báo Kho
          // (giá sau duyệt đi đường /prices, báo thêm Giám đốc + Kế toán).
          afterApproval: false,
          actorUserId: guard.session.userId,
          actorUsername: guard.session.fullName,
        });
      }
    }

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err, id: params.id }, "update PO failed");
    return jsonError("INTERNAL", "Không cập nhật được PO.", 500);
  }
}
