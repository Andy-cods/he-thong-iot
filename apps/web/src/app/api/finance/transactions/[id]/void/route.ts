import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getFinTransactionById, voidTransaction } from "@/server/repos/finTransactions";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Huỷ giao dịch (status→VOID, KHÔNG xoá cứng — giữ audit trail). Trigger
 * `fin_account_recalc_balance` tự trừ lại balance vì chỉ SUM status='POSTED'.
 *
 * LƯU Ý guard action: dùng "update" (KHÔNG phải "delete") — RBAC matrix
 * (`packages/shared/src/rbac/matrix.ts`) cố tình KHÔNG cấp `delete:finance`
 * cho accountant (chỉ admin có) đúng theo nguyên tắc "chứng từ đã ghi phải
 * huỷ bằng trạng thái VOID chứ không xoá cứng" — nếu guard bằng "delete",
 * accountant (chủ sở hữu nghiệp vụ Tài chính) sẽ KHÔNG BAO GIỜ tự huỷ được
 * giao dịch của mình, phải phiền admin mọi lần. VOID là 1 update trạng thái,
 * không phải xoá dữ liệu — dùng "update" đúng bản chất thao tác.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "finance");
  if ("response" in guard) return guard.response;

  const before = await getFinTransactionById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy giao dịch.", 404);
  if (before.status === "VOID") {
    return NextResponse.json({ data: before });
  }

  try {
    const after = await voidTransaction(params.id);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy giao dịch.", 404);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CANCEL",
      objectType: "fin_transaction",
      objectId: params.id,
      before: { status: before.status },
      after: { status: "VOID" },
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "void fin transaction failed");
    return jsonError("INTERNAL", "Không huỷ được giao dịch.", 500);
  }
}
