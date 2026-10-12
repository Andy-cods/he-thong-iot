import { NextResponse, type NextRequest } from "next/server";
import { getPR, getPrStockCheck } from "@/server/repos/purchaseRequests";
import { jsonError, validateUuidParam } from "@/server/http";
import { requireCan } from "@/server/session";
import { defaultBuyQty } from "@/lib/procurement-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-requests/[id]/stock-check — dữ liệu hộp thoại Kho duyệt:
 * từng dòng gồm SL đề xuất, tồn KHẢ DỤNG HIỆN TẠI (v_item_stock.issuable_qty —
 * chỉ lô AVAILABLE, trừ giữ chỗ, không tính HOLD) và SL cần mua mặc định.
 * Chỉ Kho/admin.
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
  if (!pr) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  const lines = await getPrStockCheck(params.id);
  return NextResponse.json({
    data: {
      approvalStep: pr.approvalStep,
      lines: lines.map((l) => ({ ...l, defaultBuyQty: defaultBuyQty(l.qty, l.available) })),
    },
  });
}
