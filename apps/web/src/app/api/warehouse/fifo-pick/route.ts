import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { suggestFifoPicks } from "@/server/repos/warehouseLocation";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  itemId: z.string().uuid(),
  qty: z.coerce.number().positive(),
});

/**
 * POST /api/warehouse/fifo-pick — gợi ý lot cũ nhất cho item theo FIFO.
 * Trả về picks[] để caller hiển thị + caller tự gọi POST /api/receiving/events
 * hoặc /api/inventory/issue để thực sự xuất kho.
 *
 * V4.2 audit S-guard — chỉ `GoodsIssuePanel`/`IssueMovementView` gọi route
 * này; cả hai chỉ render khi `can(roles,"create","goodsIssue")` (admin/
 * warehouse) → siết `read:inventory` khớp thực tế sử dụng, không phá tính
 * năng của role khác (planner/operator không bao giờ thấy panel này).
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "read", "inventory");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  try {
    const result = await suggestFifoPicks(body.data.itemId, body.data.qty);
    return NextResponse.json({ data: result });
  } catch (e) {
    return jsonError(
      "FIFO_PICK_FAILED",
      (e as Error).message ?? "Không gợi ý được FIFO picks",
      500,
    );
  }
}
