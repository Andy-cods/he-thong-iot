import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getWoMaterialPlan } from "@/server/repos/workOrderMaterialPlan";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/work-orders/[id]/material-plan — V4.4 (Việc 1).
 *
 * Tính nhu cầu vật tư theo BOM của WO (đã trừ phần đã xin qua ISR/PR) — dùng
 * để hiển thị bảng xem trước trong Sheet "Xin vật tư" VÀ badge trạng thái cấp
 * vật tư trên trang chi tiết WO (đã xin / đã xuất / còn thiếu). Read-only,
 * mọi role đọc được WO đều xem được (badge hiển thị cho tất cả, nút bấm tạo
 * yêu cầu mới giới hạn ở POST request-materials).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "wo");
  if ("response" in guard) return guard.response;

  try {
    const plan = await getWoMaterialPlan(params.id);
    if (!plan) return jsonError("NOT_FOUND", "Không tìm thấy lệnh sản xuất.", 404);
    return NextResponse.json({ data: plan });
  } catch (err) {
    logger.error({ err, id: params.id }, "get WO material plan failed");
    return jsonError("INTERNAL", "Không tính được nhu cầu vật tư.", 500);
  }
}
