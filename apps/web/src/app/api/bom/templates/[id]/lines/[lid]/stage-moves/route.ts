import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { lineBelongsToTemplate } from "@/server/repos/bomLines";
import { listLineMoves } from "@/server/repos/bomStageMoves";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BOM V5 / WP6 — lịch sử chuyển bước của 1 dòng. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; lid: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;
  try {
    if (!(await lineBelongsToTemplate(params.lid, params.id)))
      return jsonError("NOT_FOUND", "Không tìm thấy linh kiện.", 404);
    return NextResponse.json({ data: await listLineMoves(params.lid) });
  } catch (err) {
    logger.error({ err, lid: params.lid }, "list bom stage moves failed");
    return jsonError("INTERNAL", "Không tải được lịch sử chuyển bước.", 500);
  }
}
