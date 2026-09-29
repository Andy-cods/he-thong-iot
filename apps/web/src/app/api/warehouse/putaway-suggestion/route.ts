import { NextResponse, type NextRequest } from "next/server";
import { suggestPutawayBins } from "@/server/repos/putawaySuggestion";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.3 — GET /api/warehouse/putaway-suggestion?itemId=...&qty=...
 *
 * Gợi ý vị trí (bin) khi nhận hàng / xếp kệ / nhập kho thành phẩm — dùng chung
 * cho wizard nhận hàng, dialog hoàn thành WO, tab "Việc cần làm hôm nay".
 * RBAC `read:inventory` (mọi role có thể nhận hàng/xếp kệ: admin/warehouse,
 * qc qua tab Kho). Không đổi API nhận hàng — client tự chọn `binId` từ danh
 * sách trả về rồi gửi như dropdown cũ (`locationBinId`).
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "inventory");
  if ("response" in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") ?? "";
  const qtyRaw = searchParams.get("qty") ?? "";
  const qty = Number(qtyRaw);
  // V4.3 mục 3 — "Xếp kệ" từ Chờ xếp kệ: loại chính bin Chờ xếp kệ khỏi gợi ý
  // (không gợi ý chuyển từ chính nó về chính nó).
  const excludeBinIds = (searchParams.get("excludeBinIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));

  if (!/^[0-9a-f-]{36}$/i.test(itemId)) {
    return jsonError("INVALID_ITEM_ID", "itemId không hợp lệ", 400);
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return jsonError("INVALID_QTY", "qty phải lớn hơn 0", 400);
  }

  try {
    const data = await suggestPutawayBins(itemId, qty, { excludeBinIds });
    return NextResponse.json({ data });
  } catch (e) {
    return jsonError(
      "PUTAWAY_SUGGESTION_FAILED",
      (e as Error).message ?? "Không lấy được gợi ý vị trí",
      500,
    );
  }
}
