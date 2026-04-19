import { NextResponse, type NextRequest } from "next/server";
import { releaseRevisionSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  getTemplateById,
  updateTemplate,
} from "@/server/repos/bomTemplates";
import {
  listRevisions,
  releaseRevision,
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
 * GET /api/bom/templates/[id]/revisions — list tất cả revision của template.
 * POST /api/bom/templates/[id]/revisions — RELEASE 1 revision mới.
 *   - admin/planner only
 *   - Clone tree hiện tại → frozen_snapshot + revision_no R01/R02/...
 *   - Auto-promote template DRAFT → ACTIVE (immutable sau release đầu tiên)
 *   - Audit action=RELEASE
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomRevision");
  if ("response" in guard) return guard.response;

  const template = await getTemplateById(params.id);
  if (!template) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  const rows = await listRevisions(params.id);
  return NextResponse.json({ data: rows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "bomRevision");
  if ("response" in guard) return guard.response;

  const template = await getTemplateById(params.id);
  if (!template) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  if (template.status === "OBSOLETE") {
    return jsonError(
      "TEMPLATE_OBSOLETE",
      "BOM đã ngừng dùng — không release được revision mới.",
      409,
    );
  }

  const body = await parseJson(req, releaseRevisionSchema);
  if ("response" in body) return body.response;

  try {
    const revision = await releaseRevision({
      templateId: params.id,
      userId: guard.session.userId,
      notes: body.data.notes ?? null,
    });

    // Auto-promote DRAFT → ACTIVE sau release đầu tiên
    if (template.status === "DRAFT") {
      await updateTemplate(params.id, { status: "ACTIVE" });
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "RELEASE",
      objectType: "bom_revision",
      objectId: revision.id,
      after: {
        templateId: params.id,
        templateCode: template.code,
        revisionNo: revision.revisionNo,
        notes: body.data.notes ?? null,
      },
      notes: `Release ${revision.revisionNo} cho ${template.code}`,
      ...meta,
    });

    return NextResponse.json({ data: revision }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("TEMPLATE_EMPTY")) {
      return jsonError(
        "TEMPLATE_EMPTY",
        "BOM chưa có linh kiện — không thể release revision.",
        409,
      );
    }
    logger.error(
      { err, templateId: params.id },
      "release bom revision failed",
    );
    return jsonError("INTERNAL", "Không release được revision.", 500);
  }
}
