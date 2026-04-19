import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getLotHistory } from "@/server/repos/lotSerialHistory";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "reservation");
  if ("response" in guard) return guard.response;

  try {
    const detail = await getLotHistory(params.id);
    if (!detail) {
      return jsonError("NOT_FOUND", "Lot/Serial không tồn tại.", 404);
    }
    return NextResponse.json({ data: detail });
  } catch (err) {
    logger.error({ err }, "lot history failed");
    return jsonError("INTERNAL", "Lỗi tải timeline lot.", 500);
  }
}
