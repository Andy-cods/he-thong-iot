import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getBoardHistory } from "@/server/repos/productionBoard";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/production-board/[id]/history — lịch sử thay đổi 1 mã hàng.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "productionBoard");
  if ("response" in guard) return guard.response;

  try {
    const data = await getBoardHistory(params.id);
    return NextResponse.json({ data });
  } catch (err) {
    logger.error({ err, id: params.id }, "get board history failed");
    return jsonError("INTERNAL", "Lỗi tải lịch sử.", 500);
  }
}
