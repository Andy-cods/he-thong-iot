import { NextResponse, type NextRequest } from "next/server";
import { materialRowCreateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getSheetById } from "@/server/repos/bomSheets";
import {
  createMaterialRow,
  listMaterialRows,
} from "@/server/repos/bomSheetRows";
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
 * GET /api/bom/sheets/[sheetId]/material-rows — list rows vật liệu của sheet.
 * POST — tạo row mới.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { sheetId: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  try {
    const sheet = await getSheetById(params.sheetId);
    if (!sheet) return jsonError("NOT_FOUND", "Không tìm thấy sheet.", 404);
    // V2.0 Sprint 6: combined Material&Process — sheet MATERIAL hoặc PROCESS
    // đều cho phép cả material_rows + process_rows attach. UI render side-by-side.
    if (sheet.kind !== "MATERIAL" && sheet.kind !== "PROCESS") {
      return jsonError(
        "WRONG_SHEET_KIND",
        `Sheet kind="${sheet.kind}" không hỗ trợ material rows.`,
        409,
      );
    }
    const rows = await listMaterialRows(params.sheetId);
    return NextResponse.json({ data: rows });
  } catch (err) {
    logger.error({ err }, "list material rows failed");
    return jsonError("INTERNAL", "Lỗi tải danh sách vật liệu.", 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { sheetId: string } },
) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  const sheet = await getSheetById(params.sheetId);
  if (!sheet) return jsonError("NOT_FOUND", "Không tìm thấy sheet.", 404);
  if (sheet.kind !== "MATERIAL" && sheet.kind !== "PROCESS") {
    return jsonError(
      "WRONG_SHEET_KIND",
      "Sheet không hỗ trợ material rows.",
      409,
    );
  }

  const body = await parseJson(req, materialRowCreateSchema);
  if ("response" in body) return body.response;

  try {
    const row = await createMaterialRow({
      sheetId: params.sheetId,
      data: body.data,
      createdBy: guard.session.userId,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "bom_sheet_material_row",
      objectId: row.id,
      after: row,
      ...meta,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create material row failed");
    return jsonError("INTERNAL", "Lỗi tạo dòng vật liệu.", 500);
  }
}
