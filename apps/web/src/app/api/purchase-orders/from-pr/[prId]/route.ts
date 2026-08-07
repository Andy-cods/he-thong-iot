import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createPOFromPR } from "@/server/repos/purchaseOrders";
import { getPR } from "@/server/repos/purchaseRequests";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPOCreatedFromPR } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-orders/from-pr/[prId]
 *
 * V3.4 — Convert PR APPROVED → N PO split theo preferred_supplier_id atomic.
 * Body (optional): { supplierOverrides: { [prLineId]: supplierId } }
 *   - Nếu PR có line thiếu preferred_supplier, FE có thể prompt user chọn
 *     supplier rồi pass map qua đây để gán + convert trong 1 transaction.
 *   - Nếu vẫn thiếu sau override → 422 MISSING_SUPPLIER với danh sách lineIds.
 */
const bodySchema = z
  .object({
    supplierOverrides: z.record(z.string().uuid(), z.string().uuid()).optional(),
    // V3.10.2 — NCC nhập tay: map { prLineId → tên NCC }. Backend find-or-create.
    newSupplierNames: z
      .record(z.string().uuid(), z.string().trim().min(1).max(255))
      .optional(),
  })
  .optional();

export async function POST(
  req: NextRequest,
  { params }: { params: { prId: string } },
) {
  const guard = await requireCan(req, "create", "po");
  if ("response" in guard) return guard.response;

  // Body optional — POST không body cũng OK (legacy)
  let supplierOverrides: Record<string, string> | undefined;
  let newSupplierNames: Record<string, string> | undefined;
  try {
    const text = await req.text();
    if (text && text.trim().length > 0) {
      const parsed = bodySchema.parse(JSON.parse(text));
      supplierOverrides = parsed?.supplierOverrides;
      newSupplierNames = parsed?.newSupplierNames;
    }
  } catch {
    // Ignore body parse errors — convert without overrides
  }

  try {
    const result = await createPOFromPR(
      params.prId,
      guard.session.userId,
      supplierOverrides,
      newSupplierNames,
    );

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CONVERT",
      objectType: "purchase_request",
      objectId: params.prId,
      after: {
        poIds: result.createdPOs.map((p) => p.id),
        poNos: result.createdPOs.map((p) => p.poNo),
        linesBySupplier: result.linesBySupplier,
        ...(supplierOverrides
          ? { supplierOverrides: Object.keys(supplierOverrides).length }
          : {}),
      },
      notes: `Converted → ${result.createdPOs.length} PO`,
      ...meta,
    });

    // V3.16 (vấn đề 2) — Convert PR→PO trước đây KHÔNG gửi thông báo cho ai.
    // Lấy lại PR SAU convert (chỉ status/approvalStep đổi, code/paperFormNo/
    // requestedBy giữ nguyên) để lấy prNo + creator cho notify. Fire-and-forget,
    // không chặn response nếu lookup/notify lỗi.
    if (result.createdPOs.length > 0) {
      const pr = await getPR(params.prId).catch(() => null);
      const firstPo = result.createdPOs[0];
      if (firstPo) {
        void notifyPOCreatedFromPR({
          prId: params.prId,
          prNo: pr?.paperFormNo ?? pr?.code ?? params.prId,
          prCreatorUserId: pr?.requestedBy ?? null,
          poCount: result.createdPOs.length,
          firstPoId: firstPo.id,
          actorUserId: guard.session.userId,
          actorUsername: guard.session.username,
        });
      }
    }

    return NextResponse.json({
      data: {
        createdPOs: result.createdPOs,
        linesBySupplier: result.linesBySupplier,
      },
    });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("PR_NOT_FOUND"))
      return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);
    if (msg.includes("PR_NOT_APPROVED"))
      return jsonError(
        "INVALID_STATE",
        "PR chưa được duyệt — không thể convert PO.",
        409,
      );
    if (msg.includes("MISSING_PREFERRED_SUPPLIER"))
      return jsonError(
        "MISSING_SUPPLIER",
        "Có dòng PR chưa gán nhà cung cấp ưu tiên. Vui lòng chọn NCC cho từng dòng để tiếp tục.",
        422,
      );
    if (msg.includes("PR_HAS_FREETEXT_LINES")) {
      const detail = msg.replace("PR_HAS_FREETEXT_LINES: ", "");
      return jsonError(
        "PR_HAS_FREETEXT_LINES",
        `Phiếu có dòng vật tư nhập tay chưa link với danh mục: ${detail}. Hãy chuẩn hóa vật tư trong danh mục Item trước khi tạo PO.`,
        422,
      );
    }
    if (msg.includes("PR_EMPTY"))
      return jsonError("VALIDATION", "PR không có dòng nào.", 422);

    logger.error({ err, prId: params.prId }, "convert PR→PO failed");
    return jsonError("INTERNAL", "Không convert được PR sang PO.", 500);
  }
}
