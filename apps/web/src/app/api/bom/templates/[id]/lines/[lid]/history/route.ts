import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { lineBelongsToTemplate } from "@/server/repos/bomLines";
import { jsonError } from "@/server/http";
import { listLineChanges } from "@/server/services/bomLineSupplier";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BOM V5 / WP2 — lịch sử đổi NCC (và trường khác sau này) của 1 dòng. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; lid: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  try {
    if (!(await lineBelongsToTemplate(params.lid, params.id)))
      return jsonError("NOT_FOUND", "Không tìm thấy linh kiện.", 404);
    const rows = await listLineChanges(params.lid);
    return NextResponse.json({ data: rows });
  } catch (err) {
    logger.error({ err, lid: params.lid }, "list bom line history failed");
    return jsonError("INTERNAL", "Không tải được lịch sử.", 500);
  }
}
