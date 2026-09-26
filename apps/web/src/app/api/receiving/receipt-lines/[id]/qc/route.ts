import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { QcDecisionError, decideReceiptLineQc } from "@/server/repos/inboundQc";
import { mapDbGuardError } from "@/server/repos/stockGuard";
import { writeAudit } from "@/server/services/audit";
import { notifyReceiptQcFailed } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.1 Đợt 1a — POST /api/receiving/receipt-lines/[id]/qc
 *
 * Kết luận QC nhập kho cho 1 dòng phiếu nhập (↔ 1 lô).
 * Body: `{ result: "PASS" | "FAIL", notes?: string }` — FAIL bắt buộc lý do.
 *   - PASS: lô HOLD(QC_*) → AVAILABLE (xuất được).
 *   - FAIL: lô HOLD/QC_FAIL + nhả giữ chỗ trên lô + notify Kho + Thu mua.
 *   - Cho FAIL → PASS (kiểm lại); KHÔNG cho PASS → FAIL.
 *
 * RBAC: `approve:qcInspection` (Tổ QC + Giám đốc). Audit `QC_CHECK`.
 */
const bodySchema = z
  .object({
    result: z.enum(["PASS", "FAIL"]),
    notes: z.string().trim().max(500, "Tối đa 500 ký tự").optional().nullable(),
  })
  .refine((b) => b.result === "PASS" || (b.notes?.trim().length ?? 0) >= 3, {
    message: "Kết luận Không đạt phải ghi lý do (tối thiểu 3 ký tự).",
    path: ["notes"],
  });

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "qcInspection");
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return jsonError("INVALID_ID", "ID dòng phiếu nhập không hợp lệ.", 400);
  }

  const body = await parseJson(req, bodySchema);
  if ("response" in body) return body.response;
  const notes = body.data.notes?.trim() || null;

  try {
    const r = await decideReceiptLineQc({
      lineId: params.id,
      result: body.data.result,
      notes,
      userId: guard.session.userId,
    });

    await writeAudit({
      actor: guard.session,
      action: "QC_CHECK",
      objectType: "inbound_receipt_line",
      objectId: r.lineId,
      before: { qcStatus: r.previousStatus },
      after: {
        qcStatus: r.result,
        receiptNo: r.receiptNo,
        sku: r.sku,
        lotSerialId: r.lotSerialId,
        lotCode: r.lotCode,
        qty: r.qty,
        lotStatus: r.lotStatus,
        receiptQcFlag: r.receiptQcFlag,
        releasedReservations: r.releasedReservations,
      },
      notes: `QC ${r.result === "PASS" ? "Đạt" : "Không đạt"} ${r.sku} (${r.receiptNo})${notes ? `: ${notes}` : ""}`,
      ...extractRequestMeta(req),
    });

    if (r.result === "FAIL") {
      void notifyReceiptQcFailed({
        receiptId: r.receiptId,
        receiptNo: r.receiptNo,
        poId: r.poId,
        poNo: r.poNo,
        sku: r.sku,
        lotCode: r.lotCode,
        qty: r.qty,
        notes,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.username,
      });
    }

    return NextResponse.json({ data: r });
  } catch (err) {
    if (err instanceof QcDecisionError) {
      return jsonError(err.code, err.message, err.status);
    }
    const g = mapDbGuardError(err);
    if (g) return jsonError(g.code, g.message, g.status);
    logger.error({ err, lineId: params.id }, "receipt line qc failed");
    return jsonError("INTERNAL", "Không ghi được kết luận QC.", 500);
  }
}
