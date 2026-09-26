import { NextResponse, type NextRequest } from "next/server";
import { finTransferCreateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { createTransfer } from "@/server/repos/finTransactions";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { finSourceErrorResponse, resolveOverdraft } from "@/server/services/financeHttp";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.1 Đợt 3 (Q7) — POST /api/finance/transfers — chuyển quỹ nội bộ giữa 2
 * nguồn (VD rút quỹ tiền mặt nạp TK chi tiêu). Sinh phiếu `CQ-YYMM-NNNN`:
 * 1 dòng OUT ở nguồn đi + 1 dòng IN (`…-N`) ở nguồn nhận, cùng
 * `transfer_group_id`. KHÔNG tính vào báo cáo thu/chi. Nguồn đi không đủ số dư
 * → 409 (admin được vượt bằng `allowOverdraft: true`).
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "finance");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, finTransferCreateSchema);
  if ("response" in body) return body.response;

  try {
    const result = await createTransfer(body.data, guard.session.userId, {
      allowOverdraft: resolveOverdraft(guard.session, body.data.allowOverdraft),
    });
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "fin_transaction",
      objectId: result.legs[0]?.id ?? result.transferGroupId,
      after: result,
      notes: `chuyển quỹ nội bộ ${result.code}`,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const sourceErr = finSourceErrorResponse(err);
    if (sourceErr) return sourceErr;
    logger.error({ err }, "create fin transfer failed");
    return jsonError("INTERNAL", "Không tạo được phiếu chuyển quỹ.", 500);
  }
}
