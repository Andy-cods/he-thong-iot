import { NextResponse, type NextRequest } from "next/server";
import {
  getPR,
  getRecheckPendingPoBlock,
  getPRIssuedQtyByLine,
  getPrShortOfCommitment,
  getPrStockCheck,
} from "@/server/repos/purchaseRequests";
import { jsonError, validateUuidParam } from "@/server/http";
import { requireCan } from "@/server/session";
import { canAccessPR } from "@/server/services/prAccess";
import { defaultBuyQty, isStockRecheckableState } from "@/lib/procurement-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-requests/[id]/stock-check — dữ liệu hộp thoại Kho duyệt:
 * từng dòng gồm SL đề xuất, tồn KHẢ DỤNG HIỆN TẠI (v_item_stock.issuable_qty —
 * chỉ lô AVAILABLE, trừ giữ chỗ, không tính HOLD) TRỪ phần đã giữ chỗ cho phiếu
 * khác (L1), và SL cần mua mặc định. Chỉ Kho/admin.
 * `?recheck=1` (Kiểm tồn lại, phiếu đã duyệt): SL của dòng = đề xuất − đã xuất.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  if (!guard.session.roles.includes("admin") && !guard.session.roles.includes("warehouse")) {
    return jsonError("FORBIDDEN", "Chỉ Admin hoặc Bộ phận Kho được kiểm tồn khi duyệt.", 403);
  }
  const pr = await getPR(params.id);
  // N1 — nháp của người khác / phiếu không được xem → 404 như các route khác.
  if (!pr || !canAccessPR(guard.session, pr)) {
    return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  }
  const recheck = req.nextUrl.searchParams.get("recheck") === "1";
  if (recheck && !isStockRecheckableState(pr)) {
    return jsonError("INVALID_STATE", "Phiếu này không kiểm tồn lại được.", 409);
  }
  if (recheck) {
    // L4 — CÙNG điều kiện với POST recheck-stock: chỉ chặn khi còn PO đang chờ hàng về.
    const block = await getRecheckPendingPoBlock(params.id);
    if (block) return jsonError("INVALID_STATE", block, 409);
  }
  const issued = recheck ? await getPRIssuedQtyByLine(params.id) : undefined;
  const lines = await getPrStockCheck(params.id, undefined, issued);
  const short = await getPrShortOfCommitment(pr);
  return NextResponse.json({
    data: {
      shortOfCommitment: short.length > 0,
      shortOfCommitmentItems: short,
      approvalStep: pr.approvalStep,
      recheck,
      lines: lines.map((l) => ({ ...l, defaultBuyQty: defaultBuyQty(l.qty, l.available) })),
    },
  });
}
