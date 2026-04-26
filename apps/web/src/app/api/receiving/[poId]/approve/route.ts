import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  getPO,
  getPOReceivingTotals,
  markPOReceived,
} from "@/server/repos/purchaseOrders";
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
 * POST /api/receiving/[poId]/approve — V3 warehouse redesign (TASK-20260427-014).
 *
 * Duyệt nhận đủ một PO. SENT/PARTIAL → RECEIVED.
 *
 * Guard: tổng `received_qty / ordered_qty` ≥ 95% (sum across PO lines).
 * Nếu < 95% → 409 NOT_ENOUGH_RECEIVED + chi tiết ratio.
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

  const totals = await getPOReceivingTotals(params.poId);
  if (totals.ordered <= 0) {
    return jsonError(
      "EMPTY_PO",
      "PO không có line nào để duyệt nhận.",
      409,
      { totals },
    );
  }
  if (totals.ratio < RECEIVED_THRESHOLD) {
    return jsonError(
      "NOT_ENOUGH_RECEIVED",
      `Mới nhận ${(totals.ratio * 100).toFixed(1)}% (yêu cầu ≥ ${
        RECEIVED_THRESHOLD * 100
      }%).`,
      409,
      { totals, threshold: RECEIVED_THRESHOLD },
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
