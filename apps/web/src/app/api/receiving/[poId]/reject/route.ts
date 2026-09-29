import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { POTransitionError, cancelPO, getPO } from "@/server/repos/purchaseOrders";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/receiving/[poId]/reject — V3 warehouse redesign (TASK-20260427-014).
 *
 * Từ chối nhận hàng (hư hỏng, sai item, sai số lượng nghiêm trọng).
 *
 * Chỉ SENT (chưa nhận gì) → CANCELLED. V4.2: PO PARTIAL đã có hàng thật trong
 * kho KHÔNG được huỷ ở đây (trước đây được → mất đối soát) — phải "Đóng PO".
 * Dùng chung `cancelPO` (transaction + FOR UPDATE + chặn HAS_RECEIPTS).
 *
 * Note: enum `purchase_order_status` không có 'REJECTED' — dùng CANCELLED +
 * metadata để đánh dấu (KISS, không alter enum).
 *
 * Body: `{ reason: string (3..500) }` (bắt buộc).
 *
 * RBAC: `transition` `po` (admin + warehouse).
 */

const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Lý do tối thiểu 3 ký tự")
    .max(500, "Tối đa 500 ký tự"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { poId: string } },
) {
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;

  const before = await getPO(params.poId);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

  if (before.status === "CANCELLED") {
    return jsonError("ALREADY_CANCELLED", "PO đã CANCELLED.", 409);
  }
  if (before.status === "PARTIAL") {
    return jsonError(
      "HAS_RECEIPTS",
      "PO đã nhận một phần hàng — không từ chối được. Dùng “Đóng PO” ở trang chi tiết PO.",
      409,
    );
  }
  if (before.status !== "SENT") {
    return jsonError(
      "INVALID_STATE",
      `PO đang ${before.status} — chỉ từ chối được PO đã gửi NCC, chưa nhận hàng.`,
      409,
    );
  }

  const body = await parseJson(req, rejectSchema);
  if ("response" in body) return body.response;

  try {
    const row = await cancelPO(
      params.poId,
      guard.session.userId,
      `Từ chối nhận hàng: ${body.data.reason}`,
    );

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CANCEL",
      objectType: "purchase_order",
      objectId: params.poId,
      before: { status: before.status },
      after: {
        status: row.status,
        cancelledAt: row.cancelledAt,
      },
      notes: `Receiving rejected: ${body.data.reason}`,
      ...meta,
    });

    return NextResponse.json({
      ok: true,
      data: row,
    });
  } catch (err) {
    if (err instanceof POTransitionError) {
      return jsonError(err.code, err.message, err.status);
    }
    logger.error({ err, poId: params.poId }, "receiving reject failed");
    return jsonError("INTERNAL", "Không từ chối được PO.", 500);
  }
}
