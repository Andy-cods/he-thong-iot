import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { lineBelongsToTemplate } from "@/server/repos/bomLines";
import { getActiveWosForBomEdit } from "@/server/repos/workOrders";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TASK-6VIEC Việc 5 — GET /api/bom/templates/[id]/lines/[lid]/wo-impact
 *
 * Trả số lệnh SX (WO) CHƯA HOÀN THÀNH đang dùng BOM này (template hoặc dòng
 * cụ thể) để FE hỏi xác nhận TRƯỚC khi lưu sửa/xoá dòng BOM — xem
 * `BomLineSheet.tsx` (sửa) + `BomGridPro.tsx` (xoá). Chỉ cảnh báo, KHÔNG
 * chặn: route trả dữ liệu, FE tự quyết định hiện dialog xác nhận rồi mới
 * gọi PATCH/DELETE thật.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; lid: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const belongs = await lineBelongsToTemplate(params.lid, params.id);
  if (!belongs) return jsonError("NOT_FOUND", "Không tìm thấy linh kiện.", 404);

  try {
    const impact = await getActiveWosForBomEdit({
      bomTemplateId: params.id,
      bomLineId: params.lid,
    });
    return NextResponse.json({ data: impact });
  } catch (err) {
    logger.error({ err, lid: params.lid }, "bom line wo-impact failed");
    return jsonError(
      "INTERNAL",
      "Không kiểm tra được lệnh SX liên quan.",
      500,
    );
  }
}
