import { NextResponse, type NextRequest } from "next/server";
import { bomLineMoveSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  getLineById,
  lineBelongsToTemplate,
  moveLine,
} from "@/server/repos/bomLines";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; lid: string } },
) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  const belongs = await lineBelongsToTemplate(params.lid, params.id);
  if (!belongs) return jsonError("NOT_FOUND", "Không tìm thấy linh kiện.", 404);

  const body = await parseJson(req, bomLineMoveSchema);
  if ("response" in body) return body.response;

  const before = await getLineById(params.lid);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy linh kiện.", 404);

  try {
    const result = await moveLine({
      lineId: params.lid,
      newParentLineId: body.data.newParentLineId ?? null,
      newPosition: body.data.newPosition,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "bom_line",
      objectId: params.lid,
      before: {
        parentLineId: before.parentLineId,
        level: before.level,
        position: before.position,
      },
      after: {
        parentLineId: body.data.newParentLineId ?? null,
        level: result.newLevel,
        position: body.data.newPosition,
      },
      notes: "move",
      ...meta,
    });
    return NextResponse.json({
      data: {
        id: params.lid,
        newLevel: result.newLevel,
        shift: result.shift,
      },
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "CANNOT_MOVE_INTO_DESCENDANT") {
      return jsonError(
        "CANNOT_MOVE_INTO_DESCENDANT",
        "Không thể di chuyển linh kiện vào chính nhánh con của nó.",
        409,
      );
    }
    if (e.code === "MAX_DEPTH_EXCEEDED") {
      return jsonError(
        "MAX_DEPTH_EXCEEDED",
        "Di chuyển sẽ vượt quá 5 cấp.",
        422,
      );
    }
    if (e.code === "NEW_PARENT_NOT_FOUND") {
      return jsonError(
        "NEW_PARENT_NOT_FOUND",
        "Không tìm thấy dòng cha mới.",
        404,
      );
    }
    logger.error({ err, lid: params.lid }, "move bom line failed");
    return jsonError("INTERNAL", "Không di chuyển được linh kiện.", 500);
  }
}
