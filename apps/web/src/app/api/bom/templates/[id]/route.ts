import { NextResponse, type NextRequest } from "next/server";
import { bomTemplateUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  getTemplateById,
  hardDeleteTemplate,
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
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
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
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bomTemplateUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getTemplateById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  // V3.7.35 — OBSOLETE → DRAFT (khôi phục) chỉ cho admin/planner.
  // Trước đây OBSOLETE là trạng thái cuối — không revive được, user xoá nhầm
  // phải nhờ admin update DB. Giờ planner+admin tự khôi phục được.
  if (
    before.status === "OBSOLETE" &&
    body.data.status &&
    body.data.status !== "OBSOLETE"
  ) {
    if (body.data.status !== "DRAFT") {
      return jsonError(
        "INVALID_STATUS_TRANSITION",
        "BOM ngừng dùng chỉ khôi phục được sang DRAFT (không phải ACTIVE).",
        409,
      );
    }
    if (
      !guard.session.roles.includes("admin") &&
      !guard.session.roles.includes("planner")
    ) {
      return jsonError(
        "FORBIDDEN",
        "Chỉ admin hoặc planner được khôi phục BOM.",
        403,
      );
    }
    // Pass-through — allow OBSOLETE → DRAFT revive.
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
  const guard = await requireCan(req, "delete", "bomTemplate");
  if ("response" in guard) return guard.response;

  const before = await getTemplateById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  // V3.7.36 — Hard delete với ?hard=true (admin only). Yêu cầu BOM phải
  // OBSOLETE trước (delete 2 bước: soft → hard) để tránh accidental wipe.
  const isHard = req.nextUrl.searchParams.get("hard") === "true";
  if (isHard) {
    if (!guard.session.roles.includes("admin")) {
      return jsonError(
        "FORBIDDEN",
        "Chỉ admin được hard-delete BOM.",
        403,
      );
    }
    if (before.status !== "OBSOLETE") {
      return jsonError(
        "MUST_BE_OBSOLETE",
        "BOM phải ở trạng thái OBSOLETE (đã soft-delete) trước khi hard-delete.",
        409,
      );
    }
    try {
      await hardDeleteTemplate(params.id);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      logger.error({ err, id: params.id }, "hard delete bom template failed");
      // PG FK violation 23503 — BOM đang được tham chiếu bởi ECO/SO/product_line
      if (e.code === "23503" || (e.message ?? "").includes("foreign key")) {
        return jsonError(
          "HAS_REFERENCES",
          "BOM đang được tham chiếu bởi ECO / Sales Order / Product Line. Phải xoá các tham chiếu trước.",
          409,
        );
      }
      return jsonError("INTERNAL", "Không xoá được BOM.", 500);
    }
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "bom_template",
      objectId: params.id,
      before: { code: before.code, status: before.status },
      after: null,
      notes: "HARD delete (đã xoá khỏi DB)",
      ...meta,
    });
    return NextResponse.json({ data: { id: params.id, hardDeleted: true } });
  }

  // Soft delete (mặc định)
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
