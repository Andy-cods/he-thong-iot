import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import {
  getFinTransactionById,
  voidTransaction,
  voidTransferGroup,
} from "@/server/repos/finTransactions";
import { getFinPaymentById, voidPaymentWithAllocations } from "@/server/repos/finPayments";
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
    const meta = extractRequestMeta(req);

    // V4.1 TC-02 — giao dịch sinh từ 1 đợt thanh toán: huỷ lẻ dòng này từng làm
    // số dư hoàn lại nhưng hoá đơn vẫn "Đã trả". Nay huỷ CẢ đợt thanh toán
    // (void mọi giao dịch của đợt + xoá phân bổ + tính lại HĐ) — UI đã xác nhận.
    if (before.paymentId) {
      const payment = await getFinPaymentById(before.paymentId);
      if (payment && payment.status !== "VOID") {
        const result = await voidPaymentWithAllocations(before.paymentId);
        await writeAudit({
          actor: guard.session,
          action: "CANCEL",
          objectType: "fin_payment",
          objectId: before.paymentId,
          before: { status: payment.status },
          after: result,
          notes: `huỷ từ Sổ thu chi (giao dịch ${before.code}) → huỷ cả đợt thanh toán ${payment.code}`,
          ...meta,
        });
      } else {
        await voidTransaction(params.id);
      }
      const after = await getFinTransactionById(params.id);
      return NextResponse.json({ data: after, meta: { paymentVoided: before.paymentId } });
    }

    // V4.1 Đợt 3 (Q7) — chuyển quỹ: huỷ 1 chân = huỷ cả nhóm (2 chân) → trigger
    // hoàn số dư cả 2 nguồn.
    if (before.transferGroupId) {
      const legs = await voidTransferGroup(before.transferGroupId);
      await writeAudit({
        actor: guard.session,
        action: "CANCEL",
        objectType: "fin_transaction",
        objectId: params.id,
        before: { status: before.status },
        after: { status: "VOID", transferGroupId: before.transferGroupId, legs: legs.map((l) => l.code) },
        notes: "huỷ chuyển quỹ nội bộ (cả 2 chân)",
        ...meta,
      });
      const after = legs.find((l) => l.id === params.id) ?? null;
      return NextResponse.json({ data: after, meta: { transferVoided: before.transferGroupId } });
    }

    const after = await voidTransaction(params.id);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy giao dịch.", 404);
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
