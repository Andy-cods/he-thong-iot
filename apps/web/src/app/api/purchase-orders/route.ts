import { NextResponse, type NextRequest } from "next/server";
import { poCreateSchema, poListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { createPO, listPOs } from "@/server/repos/purchaseOrders";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import {
  notifyPOApprovalRequested,
  notifyPOSent,
} from "@/server/services/notifications";
import { requireCan } from "@/server/session";
import { parseDateParam } from "@/lib/procurement-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-orders — list PO + filter status[]/supplierId/prId.
 * POST /api/purchase-orders — create manual PO 1 supplier (admin+planner).
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, poListQuerySchema);
  if ("response" in q) return q.response;

  // V4.1 TM-25 — `?from=abc` trước đây ném lỗi trong toISOString() → 500.
  const url = new URL(req.url);
  const from = parseDateParam(url.searchParams.get("from"));
  const to = parseDateParam(url.searchParams.get("to"));
  if (from === "invalid" || to === "invalid") {
    return jsonError("VALIDATION", "Ngày lọc không hợp lệ (dùng YYYY-MM-DD).", 400);
  }

  try {
    const result = await listPOs({
      status: q.data.status,
      supplierId: q.data.supplierId,
      prId: q.data.prId,
      bomTemplateId: q.data.bomTemplateId,
      q: q.data.q,
      from,
      to,
      overdue: q.data.overdue,
      page: q.data.page,
      pageSize: q.data.pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      meta: {
        page: q.data.page,
        pageSize: q.data.pageSize,
        total: result.total,
      },
    });
  } catch (err) {
    logger.error({ err }, "list POs failed");
    return jsonError("INTERNAL", "Lỗi hệ thống khi tải đơn đặt hàng.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "po");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, poCreateSchema);
  if ("response" in body) return body.response;

  // V1.9-P9: auto-approve chỉ được phép khi user có quyền "approve", "po".
  const canApprove =
    body.data.autoApprove === true &&
    guard.session.roles.some((r) => r === "admin");

  try {
    const row = await createPO({
      supplierId: body.data.supplierId,
      prId: body.data.prId ?? null,
      linkedOrderId: body.data.linkedOrderId ?? null,
      expectedEta: body.data.expectedEta ?? null,
      currency: body.data.currency,
      paymentTerms: body.data.paymentTerms ?? null,
      deliveryAddress: body.data.deliveryAddress ?? null,
      notes: body.data.notes ?? null,
      autoApprove: canApprove,
      submitForApproval: body.data.submitForApproval,
      createdBy: guard.session.userId,
      lines: body.data.lines.map((l) => ({
        itemId: l.itemId,
        orderedQty: l.orderedQty,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        snapshotLineId: l.snapshotLineId ?? null,
        expectedEta: l.expectedEta ?? null,
        notes: l.notes ?? null,
        spec: l.spec ?? null,
      })),
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "purchase_order",
      objectId: row.id,
      after: {
        poNo: row.poNo,
        supplierId: body.data.supplierId,
        lineCount: body.data.lines.length,
        approvalStatus: row.metadata &&
          typeof row.metadata === "object" &&
          "approvalStatus" in row.metadata
            ? row.metadata.approvalStatus
            : undefined,
      },
      ...meta,
    });

    // V4.1 TM-07 — tạo kèm gửi duyệt → báo Giám đốc; Giám đốc tạo kèm duyệt
    // (PO chuyển thẳng SENT) → báo Kho chuẩn bị nhận hàng.
    const approvalStatus = (row.metadata as { approvalStatus?: string } | null)
      ?.approvalStatus;
    if (row.status === "SENT") {
      void notifyPOSent({
        poId: row.id,
        poNo: row.poNo,
        supplierName: null,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.username,
      });
    } else if (approvalStatus === "pending") {
      void notifyPOApprovalRequested({
        poId: row.id,
        poNo: row.poNo,
        totalAmount: row.totalAmount,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.username,
      });
    }

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create PO failed");
    const msg = (err as Error).message ?? "";
    // V4.1 TM-10
    if (msg.startsWith("UNPRICED_LINES")) {
      return jsonError(
        "UNPRICED_LINES",
        "PO còn dòng chưa có đơn giá — lưu nháp rồi nhập giá trước khi gửi duyệt/duyệt.",
        409,
      );
    }
    if (msg.includes("PO_MUST_HAVE_LINES")) {
      return jsonError("VALIDATION", "PO phải có ít nhất 1 dòng.", 422);
    }
    // V4.1 TM-01
    if (msg.startsWith("PR_NOT_FOUND")) {
      return jsonError("PR_NOT_FOUND", "Không tìm thấy phiếu đề xuất.", 404);
    }
    if (msg.startsWith("PR_NOT_APPROVED")) {
      return jsonError(
        "PR_NOT_APPROVED",
        "Phiếu đề xuất chưa được duyệt xong nên chưa tạo được PO.",
        409,
      );
    }
    return jsonError("INTERNAL", "Không tạo được PO.", 500);
  }
}
