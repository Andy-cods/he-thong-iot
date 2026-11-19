import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { jsonError, validateUuidParam } from "@/server/http";
import { requireShiftOutput, scopeAllows } from "@/server/shiftOutputScope";
import { getEntry, listEntryHistory } from "@/server/repos/shiftOutputEntries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shift-output/entries/[id]/history — lịch sử tạo/sửa/xoá/chốt của 1
 * dòng (audit_event). Người xem được dòng thì xem được lịch sử của nó (không
 * cần quyền `audit` — giống lib/audit-scope.ts). Gồm cả dòng đã xoá mềm.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireShiftOutput(req, "read", "shiftOutput");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  try {
    const entry = await getEntry(params.id);
    if (!entry || !scopeAllows(guard.scope, entry.siteId)) {
      return jsonError("NOT_FOUND", "Không tìm thấy dòng sản lượng.", 404);
    }
    const events = await listEntryHistory(params.id);
    return NextResponse.json({ data: events });
  } catch (err) {
    logger.error({ err, id: params.id }, "shift entry history failed");
    return jsonError("INTERNAL", "Lỗi tải lịch sử sửa.", 500);
  }
}
