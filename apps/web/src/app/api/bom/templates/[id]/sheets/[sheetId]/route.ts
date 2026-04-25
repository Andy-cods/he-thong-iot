import { NextResponse, type NextRequest } from "next/server";
import { bomSheetUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  countProjectSheets,
  deleteSheet,
  getSheetById,
  updateSheet,
} from "@/server/repos/bomSheets";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string; sheetId: string };
}

export async function GET(req: NextRequest, { params }: Params) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  try {
    const row = await getSheetById(params.sheetId);
    if (!row || row.templateId !== params.id) {
      return jsonError("NOT_FOUND", "Không tìm thấy sheet.", 404);
    }
    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "get bom sheet failed");
    return jsonError("INTERNAL", "Lỗi tải sheet.", 500);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  const before = await getSheetById(params.sheetId);
  if (!before || before.templateId !== params.id) {
    return jsonError("NOT_FOUND", "Không tìm thấy sheet.", 404);
  }

  const body = await parseJson(req, bomSheetUpdateSchema);
  if ("response" in body) return body.response;

  try {
    const after = await updateSheet(params.sheetId, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy sheet.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "bom_sheet",
      objectId: after.id,
      before,
      after,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update bom sheet failed");
    return jsonError("INTERNAL", "Lỗi cập nhật sheet.", 500);
  }
}

/**
 * DELETE /api/bom/templates/[id]/sheets/[sheetId]
 *
 * Cascade delete: bom_lines của sheet sẽ bị xoá theo (FK ON DELETE CASCADE).
 * Chặn xóa sheet PROJECT cuối cùng — BOM List phải có ≥1 sheet PROJECT
 * (theo brainstorm Q-E).
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  const before = await getSheetById(params.sheetId);
  if (!before || before.templateId !== params.id) {
    return jsonError("NOT_FOUND", "Không tìm thấy sheet.", 404);
  }

  if (before.kind === "PROJECT") {
    const projectCount = await countProjectSheets(params.id);
    if (projectCount <= 1) {
      return jsonError(
        "LAST_PROJECT_SHEET",
        "BOM List phải có ít nhất 1 sheet cấu trúc (PROJECT). Tạo sheet mới trước khi xoá sheet này.",
        409,
      );
    }
  }

  try {
    const deleted = await deleteSheet(params.sheetId);
    if (!deleted) return jsonError("NOT_FOUND", "Không tìm thấy sheet.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "bom_sheet",
      objectId: deleted.id,
      before,
      after: deleted,
      ...meta,
    });

    return NextResponse.json({ data: deleted });
  } catch (err) {
    logger.error({ err }, "delete bom sheet failed");
    return jsonError("INTERNAL", "Lỗi xoá sheet.", 500);
  }
}
