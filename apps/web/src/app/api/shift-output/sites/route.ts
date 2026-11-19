import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireShiftOutput } from "@/server/shiftOutputScope";
import { listSites } from "@/server/repos/shiftOutputSetup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/shift-output/sites — xưởng trong phạm vi (admin: tất cả — dùng ở Quản trị › Người dùng). */
export async function GET(req: NextRequest) {
  const guard = await requireShiftOutput(req, "read", "shiftOutputSetup");
  if ("response" in guard) return guard.response;
  try {
    const rows = await listSites(guard.scope.all ? undefined : guard.scope.siteIds);
    return NextResponse.json({ data: rows });
  } catch (err) {
    logger.error({ err }, "list sites failed");
    return jsonError("INTERNAL", "Lỗi tải danh sách xưởng.", 500);
  }
}
