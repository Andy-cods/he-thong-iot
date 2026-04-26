import { NextResponse, type NextRequest } from "next/server";
import { processRowUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  deleteProcessRow,
  getProcessRowById,
  updateProcessRow,
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

interface Params {
  params: { sheetId: string; rowId: string };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  const before = await getProcessRowById(params.rowId);
  if (!before || before.sheetId !== params.sheetId) {
    return jsonError("NOT_FOUND", "Không tìm thấy dòng quy trình.", 404);
  }

  const body = await parseJson(req, processRowUpdateSchema);
  if ("response" in body) return body.response;

  try {
    const after = await updateProcessRow(params.rowId, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy dòng.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "bom_sheet_process_row",
      objectId: after.id,
      before,
      after,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update process row failed");
    return jsonError("INTERNAL", "Lỗi cập nhật dòng quy trình.", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  const before = await getProcessRowById(params.rowId);
  if (!before || before.sheetId !== params.sheetId) {
    return jsonError("NOT_FOUND", "Không tìm thấy dòng quy trình.", 404);
  }

  try {
    const deleted = await deleteProcessRow(params.rowId);
    if (!deleted) return jsonError("NOT_FOUND", "Không tìm thấy dòng.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "bom_sheet_process_row",
      objectId: deleted.id,
      before,
      after: deleted,
      ...meta,
    });

    return NextResponse.json({ data: deleted });
  } catch (err) {
    logger.error({ err }, "delete process row failed");
    return jsonError("INTERNAL", "Lỗi xoá dòng quy trình.", 500);
  }
}
