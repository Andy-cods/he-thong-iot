import type { NextRequest } from "next/server";
import { POST as completeWorkOrder } from "@/app/api/work-orders/[id]/complete/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/assembly/wo/[id]/complete — finalize WO từ màn lắp ráp.
 *
 * V4.1 SX-24: trước đây là đường hoàn tất WO THỨ HAI (không thông báo, không
 * activity log). Nay dùng CHUNG handler `/api/work-orders/[id]/complete` →
 * cùng guard `checkWoCompletable`, audit, thông báo.
 * (Màn lắp ráp kiểu cũ đang ẩn — D10; API giữ cho tương thích.)
 */
export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  return completeWorkOrder(req, ctx);
}
