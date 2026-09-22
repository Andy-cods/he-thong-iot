import { NextResponse, type NextRequest } from "next/server";
import { finTransactionUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getFinTransactionById, updateTransaction } from "@/server/repos/finTransactions";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { diffObjects, writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const row = await getFinTransactionById(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy giao dịch.", 404);
  return NextResponse.json({ data: row });
}

/**
 * Chỉ cho sửa description/attachmentUrl/categoryId — giao dịch POSTED không
 * cho sửa amount/direction/account (giữ đúng số dòng tiền + trigger balance).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "finance");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, finTransactionUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getFinTransactionById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy giao dịch.", 404);
  if (before.status === "VOID") {
    return jsonError("FIN_TRANSACTION_VOIDED", "Giao dịch đã huỷ, không thể sửa.", 409);
  }
  try {
    const after = await updateTransaction(params.id, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy giao dịch.", 404);
    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "fin_transaction",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update fin transaction failed");
    return jsonError("INTERNAL", "Không cập nhật được giao dịch.", 500);
  }
}
