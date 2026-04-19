import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { getWoProgress } from "@/server/repos/assemblies";
import { jsonError } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  try {
    const progress = await getWoProgress(params.id);
    if (!progress) {
      return jsonError("NOT_FOUND", "Work Order không tồn tại.", 404);
    }
    return NextResponse.json({ data: progress });
  } catch (err) {
    logger.error({ err }, "wo progress failed");
    return jsonError("INTERNAL", "Lỗi tải tiến độ WO.", 500);
  }
}
