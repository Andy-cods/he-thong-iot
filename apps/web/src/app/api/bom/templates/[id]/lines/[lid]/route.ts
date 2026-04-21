import { NextResponse, type NextRequest } from "next/server";
import { bomLineDeleteQuerySchema, bomLineUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  deleteLine,
  getLineById,
  lineBelongsToTemplate,
  updateLine,
} from "@/server/repos/bomLines";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit, diffObjects } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; lid: string } },
) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  const belongs = await lineBelongsToTemplate(params.lid, params.id);
  if (!belongs) return jsonError("NOT_FOUND", "Không tìm thấy linh kiện.", 404);

  const body = await parseJson(req, bomLineUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getLineById(params.lid);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy linh kiện.", 404);

  try {
    const after = await updateLine(params.lid, {
      qtyPerParent: body.data.qtyPerParent,
      scrapPercent: body.data.scrapPercent,
      uom: body.data.uom ?? undefined,
      description: body.data.description ?? undefined,
      supplierItemCode: body.data.supplierItemCode ?? undefined,
      metadata: body.data.metadata ?? undefined,
    });
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy linh kiện.", 404);

    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "bom_line",
      objectId: params.lid,
      before: diff.before,
      after: diff.after,
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err, lid: params.lid }, "update bom line failed");
    return jsonError("INTERNAL", "Không cập nhật được linh kiện.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; lid: string } },
) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  const belongs = await lineBelongsToTemplate(params.lid, params.id);
  if (!belongs) return jsonError("NOT_FOUND", "Không tìm thấy linh kiện.", 404);

  const q = parseSearchParams(req, bomLineDeleteQuerySchema);
  if ("response" in q) return q.response;

  const before = await getLineById(params.lid);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy linh kiện.", 404);

  try {
    const result = await deleteLine(params.lid, {
      cascade: q.data.cascade === true,
    });

    const meta = extractRequestMeta(req);
    // Audit cho dòng gốc
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "bom_line",
      objectId: params.lid,
      before,
      notes: result.descendantCount > 0 ? `cascade deleted ${result.descendantCount} descendants` : null,
      ...meta,
    });
    // Audit cho descendants (loop)
    for (const descId of result.deletedIds) {
      if (descId === params.lid) continue;
      await writeAudit({
        actor: guard.session,
        action: "DELETE",
        objectType: "bom_line",
        objectId: descId,
        notes: `cascade via parent ${params.lid}`,
        ...meta,
      });
    }

    return NextResponse.json({
      data: {
        deletedIds: result.deletedIds,
        descendantCount: result.descendantCount,
      },
    });
  } catch (err) {
    const e = err as { code?: string; descendantCount?: number };
    if (e.code === "HAS_CHILDREN") {
      return NextResponse.json(
        {
          error: {
            code: "HAS_CHILDREN",
            message: "Linh kiện này có con. Gửi lại với ?cascade=true để xoá kèm.",
            details: { descendantCount: e.descendantCount ?? 0 },
          },
        },
        { status: 409 },
      );
    }
    logger.error({ err, lid: params.lid }, "delete bom line failed");
    return jsonError("INTERNAL", "Không xoá được linh kiện.", 500);
  }
}
