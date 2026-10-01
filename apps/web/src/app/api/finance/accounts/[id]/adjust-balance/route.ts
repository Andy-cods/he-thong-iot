import { NextResponse, type NextRequest } from "next/server";
import { finAccountAdjustBalanceSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { adjustFinAccountBalance, getFinAccountById } from "@/server/repos/finAccounts";
import { extractRequestMeta, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { forbidden, requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/finance/accounts/:id/adjust-balance — V4.5.
 *
 * "Điều chỉnh số dư" nguồn tiền — CHỈ Giám đốc (admin), KHÔNG phải mọi kế
 * toán có `update:finance`. Admin nhập số dư ĐÚNG hiện tại/đầu kỳ mới + lý do
 * (≥3 ký tự) → server dịch `opening_balance` để `current_balance` khớp số đó,
 * KHÔNG tạo giao dịch thu/chi giả (không làm sai báo cáo thu chi — khác hẳn
 * ghi phiếu thu/chi thường). Ghi audit before/after + lý do.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "finance");
  if ("response" in guard) return guard.response;
  if (!guard.session.roles.includes("admin")) return forbidden();

  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const body = await parseJson(req, finAccountAdjustBalanceSchema);
  if ("response" in body) return body.response;

  const before = await getFinAccountById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy tài khoản.", 404);

  try {
    const result = await adjustFinAccountBalance(params.id, body.data.newBalance);
    if (!result) return jsonError("NOT_FOUND", "Không tìm thấy tài khoản.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "fin_account",
      objectId: params.id,
      before: {
        openingBalance: result.before.openingBalance,
        currentBalance: result.before.currentBalance,
      },
      after: {
        openingBalance: result.after.openingBalance,
        currentBalance: result.after.currentBalance,
      },
      notes: `Điều chỉnh số dư — lý do: ${body.data.reason}`,
      ...meta,
    });

    return NextResponse.json({ data: result.after });
  } catch (err) {
    logger.error({ err }, "adjust fin account balance failed");
    return jsonError("INTERNAL", "Không điều chỉnh được số dư.", 500);
  }
}
