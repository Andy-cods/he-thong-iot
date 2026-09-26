import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  getPO,
  getPOLineReceiptStats,
  markPOReceived,
} from "@/server/repos/purchaseOrders";
import { evaluatePoReceipt } from "@/lib/procurement-policy";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPOReceivedFull } from "@/server/services/notifications";
import { requireCan } from "@/server/session";
import {
  getPR,
  markPRGoodsReceived,
} from "@/server/repos/purchaseRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/receiving/[poId]/approve — V3 warehouse redesign (TASK-20260427-014).
 *
 * Duyệt nhận đủ một PO. SENT/PARTIAL → RECEIVED.
 *
 * Guard (V4.1 TM-15/16): TỪNG dòng có SL ĐẠT (đã nhận − QC không đạt)
 * ≥ 95% SL đặt. Trước đây tính tổng gộp mọi dòng → một dòng nhận 0 vẫn qua,
 * hàng NG vẫn tính. Thiếu → 409 NOT_ENOUGH_RECEIVED + danh sách dòng thiếu.
 *
 * Body: `{ note?: string }` (optional ghi chú duyệt).
 *
 * RBAC: `transition` `po` (admin + warehouse).
 */

const approveSchema = z
  .object({
    note: z.string().trim().max(500).optional().nullable(),
  })
  .partial();

const RECEIVED_THRESHOLD = 0.95;

export async function POST(
  req: NextRequest,
  { params }: { params: { poId: string } },
) {
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;

  const before = await getPO(params.poId);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

  if (before.status === "RECEIVED") {
    return jsonError("ALREADY_RECEIVED", "PO đã RECEIVED.", 409);
  }
  if (before.status !== "SENT" && before.status !== "PARTIAL") {
    return jsonError(
      "INVALID_STATE",
      `PO đang ${before.status} — chỉ duyệt được PO đang SENT/PARTIAL.`,
      409,
    );
  }

  const body = await parseJson(req, approveSchema).catch(() => ({
    data: { note: null },
  }));
  const note =
    "data" in body && body.data && "note" in body.data
      ? (body.data.note ?? null)
      : null;

  const evaluation = evaluatePoReceipt(
    await getPOLineReceiptStats(params.poId),
    RECEIVED_THRESHOLD,
  );
  const t = evaluation.totals;
  const totals = {
    ordered: t.ordered,
    received: t.accepted,
    rejected: t.rejected,
    ratio: t.ordered > 0 ? t.accepted / t.ordered : 0,
  };
  if (totals.ordered <= 0) {
    return jsonError(
      "EMPTY_PO",
      "PO không có line nào để duyệt nhận.",
      409,
      { totals },
    );
  }
  if (!evaluation.ok) {
    const list = evaluation.shortLines
      .slice(0, 5)
      .map(
        (l) =>
          `dòng ${l.lineNo}: đạt ${l.accepted}/${l.ordered}${
            l.rejected > 0 ? ` (QC không đạt ${l.rejected})` : ""
          }`,
      )
      .join("; ");
    return jsonError(
      "NOT_ENOUGH_RECEIVED",
      `Còn ${evaluation.shortLines.length} dòng chưa nhận đủ hàng đạt (yêu cầu ≥ ${
        RECEIVED_THRESHOLD * 100
      }% từng dòng) — ${list}. Nếu NCC không giao nốt, dùng “Đóng PO”.`,
      409,
      { totals, threshold: RECEIVED_THRESHOLD, shortLines: evaluation.shortLines },
    );
  }

  try {
    const row = await markPOReceived(params.poId, guard.session.userId, note);
    if (!row) {
      return jsonError("CONFLICT", "PO vừa thay đổi trạng thái.", 409);
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "APPROVE",
      objectType: "purchase_order",
      objectId: params.poId,
      before: { status: before.status },
      after: {
        status: row.status,
        actualDeliveryDate: row.actualDeliveryDate,
      },
      notes: note ?? `Receiving approved · ${(totals.ratio * 100).toFixed(1)}%`,
      ...meta,
    });

    // V3.3 — Notify purchaser + engineer creator + warehouse
    // V3.7.70 — Đồng thời update PR timeline "IV. Theo dõi → Đã nhận hàng"
    let prCreatorUserId: string | null = null;
    if (before.prId) {
      const pr = await getPR(before.prId).catch(() => null);
      prCreatorUserId = pr?.requestedBy ?? null;
      // Auto-hook: PR.goodsReceivedAt = now (idempotent — chỉ set lần đầu)
      void markPRGoodsReceived(before.prId).catch(() => {});
    }
    void notifyPOReceivedFull({
      poId: params.poId,
      poNo: before.poNo,
      supplierName: null,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
      prCreatorUserId,
    });

    return NextResponse.json({
      ok: true,
      data: row,
      totals,
    });
  } catch (err) {
    logger.error({ err, poId: params.poId }, "receiving approve failed");
    return jsonError("INTERNAL", "Không duyệt được PO.", 500);
  }
}
