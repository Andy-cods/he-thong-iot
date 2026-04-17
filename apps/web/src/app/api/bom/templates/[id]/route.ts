import { NextResponse, type NextRequest } from "next/server";
import { bomTemplateUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  getTemplateById,
  loadTree,
  softDeleteTemplate,
  updateTemplate,
} from "@/server/repos/bomTemplates";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit, diffObjects } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const template = await getTemplateById(params.id);
  if (!template) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  const tree = await loadTree(params.id);

  return NextResponse.json({ data: { template, tree } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bomTemplateUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getTemplateById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  // Transition rule: OBSOLETE là trạng thái cuối — không cho transition ra
  if (before.status === "OBSOLETE" && body.data.status && body.data.status !== "OBSOLETE") {
    return jsonError(
      "INVALID_STATUS_TRANSITION",
      "BOM đã ngừng dùng — không thể đổi trạng thái.",
      409,
    );
  }
  // ACTIVE → OBSOLETE chỉ admin
  if (
    before.status === "ACTIVE" &&
    body.data.status === "OBSOLETE" &&
    !guard.session.roles.includes("admin")
  ) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ admin được chuyển BOM ACTIVE → OBSOLETE.",
      403,
    );
  }

  try {
    const after = await updateTemplate(params.id, {
      name: body.data.name,
      description: body.data.description ?? undefined,
      parentItemId: body.data.parentItemId ?? undefined,
      targetQty: body.data.targetQty,
      status: body.data.status,
    });
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "bom_template",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err, id: params.id }, "update bom template failed");
    return jsonError("INTERNAL", "Không cập nhật được BOM.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Soft delete chỉ admin hoặc planner
  const guard = await requireSession(req, "admin", "planner");
  if ("response" in guard) return guard.response;

  const before = await getTemplateById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  if (before.status === "OBSOLETE") {
    return jsonError("ALREADY_OBSOLETE", "BOM đã ở trạng thái ngừng dùng.", 400);
  }

  const after = await softDeleteTemplate(params.id);
  if (!after) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  const meta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "DELETE",
    objectType: "bom_template",
    objectId: params.id,
    before: { status: before.status },
    after: { status: "OBSOLETE" },
    notes: "soft delete (status=OBSOLETE)",
    ...meta,
  });

  return NextResponse.json({ data: { id: after.id, status: after.status } });
}
