import { NextResponse, type NextRequest } from "next/server";
import { supersedeRevisionSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  getRevision,
  supersedeRevision,
} from "@/server/repos/bomRevisions";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bom/revisions/[id]/supersede — đánh dấu SUPERSEDED (admin only).
 *
 * Revision phải đang ở trạng thái RELEASED. Sau SUPERSEDED không block truy
 * xuất snapshot đã explode (audit), chỉ chặn explode mới dùng revision này.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "delete", "bomRevision");
  if ("response" in guard) return guard.response;

  const before = await getRevision(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy revision.", 404);
  if (before.status !== "RELEASED") {
    return jsonError(
      "INVALID_STATUS",
      `Chỉ revision RELEASED mới supersede được (hiện tại: ${before.status}).`,
      409,
    );
  }

  const body = await parseJson(req, supersedeRevisionSchema);
  if ("response" in body) return body.response;

  try {
    const row = await supersedeRevision(params.id, guard.session.userId);
    if (!row) {
      return jsonError(
        "CONFLICT",
        "Revision đã được supersede ở nơi khác.",
        409,
      );
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CANCEL",
      objectType: "bom_revision",
      objectId: params.id,
      before: { status: before.status },
      after: { status: row.status },
      notes:
        (body.data.reason ?? "").length > 0
          ? `Supersede: ${body.data.reason}`
          : "Supersede revision",
      ...meta,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error(
      { err, revisionId: params.id },
      "supersede bom revision failed",
    );
    return jsonError("INTERNAL", "Không supersede được revision.", 500);
  }
}
