import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { deleteProgressLog } from "@/server/repos/woProgressLog";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { hasRole, requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/work-orders/[id]/progress-log/[entryId]
 *
 * Admin only — soft restriction, không rollback qty (legacy protection).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } },
) {
  const guard = await requireCan(req, "delete", "wo");
  if ("response" in guard) return guard.response;

  if (!hasRole(guard.session, "admin")) {
    return jsonError("FORBIDDEN", "Chỉ admin mới xóa được entry.", 403);
  }

  try {
    const ok = await deleteProgressLog(params.id, params.entryId);
    if (!ok) {
      return jsonError("NOT_FOUND", "Entry không tồn tại.", 404);
    }
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "wo_progress_log",
      objectId: params.entryId,
      notes: `Xóa progress entry của WO ${params.id}`,
      ...meta,
    });
    return NextResponse.json({
      data: { id: params.entryId, deleted: true },
    });
  } catch (err) {
    logger.error(
      { err, id: params.id, entryId: params.entryId },
      "delete progress-log failed",
    );
    return jsonError("INTERNAL", "Lỗi xóa entry tiến độ.", 500);
  }
}
