import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createPOFromPR } from "@/server/repos/purchaseOrders";
import { getPR, getPrLedger } from "@/server/repos/purchaseRequests";
import {
  extractRequestMeta,
  jsonError,
  validateUuidParam,
} from "@/server/http";
import { PR_COMPLETED_PO_MESSAGE } from "@/lib/pr-close-policy";
import { canCreatePoFromPr, convertBlockedMessage } from "@/lib/procurement-policy";
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

  // A12 — id sai định dạng → 400 sạch (trước đây Postgres ném lỗi cast → 500).
  const idCheck = validateUuidParam(params.prId, "prId");
  if ("response" in idCheck) return idCheck.response;

  // A19 — chặn ở API theo vai (UI đã ẩn nút nhưng planner có create:po vẫn gọi được).
  if (!canCreatePoFromPr(guard.session.roles)) {
    return jsonError("FORBIDDEN", "Chỉ Mua hàng hoặc Admin được tạo PO từ đề xuất.", 403);
  }

  // Body optional — POST không body cũng OK (legacy)
  // V4.1 TM-09 — body SAI trước đây bị nuốt → convert "im lặng" bỏ mất NCC người
  // dùng đã chọn (tạo PO sai NCC). Nay trả 422.
  let supplierOverrides: Record<string, string> | undefined;
  let newSupplierNames: Record<string, string> | undefined;
  const text = await req.text().catch(() => "");
  if (text && text.trim().length > 0) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return jsonError("VALIDATION", "Dữ liệu gửi lên không phải JSON hợp lệ.", 422);
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonError(
        "VALIDATION",
        "Danh sách NCC chọn cho từng dòng không hợp lệ.",
        422,
        { issues: parsed.error.issues },
      );
    }
    supplierOverrides = parsed.data?.supplierOverrides;
    newSupplierNames = parsed.data?.newSupplierNames;
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
      // N5 — chỉ đóng "Cần tạo PO" khi phiếu đã đặt đủ.
      const led = await getPrLedger(params.prId).catch(() => null);
      const prFullyOrdered = !led || led.ledger.toOrder <= 5e-5;
      const firstPo = result.createdPOs[0];
      if (firstPo) {
        void notifyPOCreatedFromPR({
          prId: params.prId,
          prNo: pr?.paperFormNo ?? pr?.code ?? params.prId,
          prCreatorUserId: pr?.requestedBy ?? null,
          poCount: result.createdPOs.length,
          firstPoId: firstPo.id,
          prFullyOrdered,
          actorUserId: guard.session.userId,
          actorUsername: guard.session.fullName,
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
    if (msg.includes("PR_COMPLETED")) {
      return jsonError("PR_COMPLETED", PR_COMPLETED_PO_MESSAGE, 409);
    }
    if (msg.includes("PR_NOT_APPROVED")) {
      // A17 — nêu đúng lý do theo trạng thái (đã lập PO ≠ chưa duyệt).
      const st = /status=([A-Z_]+)/.exec(msg)?.[1] ?? "";
      return jsonError("INVALID_STATE", convertBlockedMessage(st), 409);
    }
    if (msg.includes("PR_ALL_COVERED"))
      return jsonError(
        "NOTHING_TO_BUY",
        "Không còn phần nào cần lập PO (Kho đã đáp ứng đủ hoặc các PO đã đặt/đã về đủ) — không tạo PO.",
        422,
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
    if (msg.includes("LINE_NOT_IN_PR"))
      return jsonError(
        "LINE_NOT_IN_PR",
        "Có dòng chọn NCC không thuộc phiếu này — tải lại trang rồi thử lại.",
        422,
      );
    if (msg.includes("PR_EMPTY"))
      return jsonError("VALIDATION", "PR không có dòng nào.", 422);

    logger.error({ err, prId: params.prId }, "convert PR→PO failed");
    return jsonError("INTERNAL", "Không convert được PR sang PO.", 500);
  }
}
