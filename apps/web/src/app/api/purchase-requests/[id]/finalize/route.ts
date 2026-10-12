import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { finalizePrIfComplete, getPR, getPrLedger } from "@/server/repos/purchaseRequests";
import { extractRequestMeta, isDbConcurrencyError, jsonError, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { canAccessPR } from "@/server/services/prAccess";
import { notifyPrAutoFinalized } from "@/server/services/prWarehouseNotify";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * N6 — POST /api/purchase-requests/[id]/finalize — Kho/admin chốt "Hoàn tất" cho phiếu mà SỔ DÒNG
 * đã đủ điều kiện (mọi dòng xuất đủ trần, không còn gì phải đặt / đang về / chờ QC) nhưng chưa tự
 * chốt (dữ liệu cũ, hoặc thao tác trước khi có tự chốt). Không đủ điều kiện → 409 kèm lý do.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  if (!guard.session.roles.includes("admin") && !guard.session.roles.includes("warehouse")) {
    return jsonError("FORBIDDEN", "Chỉ Admin hoặc Bộ phận Kho được chốt hoàn tất.", 403);
  }
  const before = await getPR(params.id);
  if (!before || !canAccessPR(guard.session, before)) {
    return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  }
  if (before.goodsIssuedAt || before.completedAt) {
    return NextResponse.json({ data: before, meta: { alreadyMarked: true } });
  }
  try {
    const done = await finalizePrIfComplete(params.id);
    if (!done) {
      const loaded = await getPrLedger(params.id);
      const l = loaded?.ledger;
      const why = !l
        ? "Không tìm thấy phiếu."
        : l.phase !== "FINAL"
          ? "Phiếu chưa duyệt cuối — chưa hoàn tất được."
          : l.pendingLines > 0
            ? `Còn ${l.pendingLines} dòng chưa xuất đủ.`
            : l.waiting > 1e-4
              ? "Còn hàng đang về hoặc lô chờ QC."
              : l.toOrder > 1e-4
                ? "Còn phần cần mua chưa lập PO — lập PO, Kiểm tồn lại hoặc dùng “Kết thúc” (bỏ phần chưa đặt)."
                : "Phiếu chưa đủ điều kiện hoàn tất.";
      logger.warn({ prId: params.id, why }, "finalize PR rejected");
      return jsonError("NOT_COMPLETE", why, 409);
    }
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_request",
      objectId: params.id,
      before: { approvalStep: before.approvalStep, completedAt: null },
      after: { approvalStep: done.approvalStep, completedAt: done.completedAt },
      notes: "YCVT → Hoàn tất (Kho chốt theo sổ dòng)",
      ...extractRequestMeta(req),
    });
    void notifyPrAutoFinalized(before, guard.session);
    return NextResponse.json({ data: done });
  } catch (err) {
    if (isDbConcurrencyError(err)) {
      return jsonError("CONFLICT", "Đang có thao tác khác trên phiếu — thử lại.", 409);
    }
    logger.error({ err }, "finalize PR failed");
    return jsonError("INTERNAL", "Không chốt hoàn tất được.", 500);
  }
}
