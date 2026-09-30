import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { listDefaultBinSuggestions } from "@/server/repos/defaultBinSuggestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.3 Việc 1 — GET /api/warehouse/default-bin-suggestions
 *
 * Danh sách vật tư có thể suy ra vị trí mặc định từ tồn thực tế (đang nằm
 * chủ yếu ở 1 ô) mà vị trí mặc định hiện tại KHÁC (hoặc chưa có) — cho Kho
 * xem rồi chọn/bỏ chọn áp dụng hàng loạt.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "inventory");
  if ("response" in guard) return guard.response;

  try {
    const data = await listDefaultBinSuggestions();
    return NextResponse.json({ data, meta: { total: data.length } });
  } catch (err) {
    return jsonError(
      "DEFAULT_BIN_SUGGESTIONS_FAILED",
      (err as Error).message ?? "Không lấy được danh sách đề xuất",
      500,
    );
  }
}
