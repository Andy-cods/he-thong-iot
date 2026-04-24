import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { deleteItem, updateItem } from "@/server/repos/qcCheckItems";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  description: z.string().min(1).max(500).optional(),
  checkType: z.enum(["BOOLEAN", "MEASUREMENT", "VISUAL"]).optional(),
  expectedValue: z.string().max(100).optional().nullable(),
  actualValue: z.string().max(100).optional().nullable(),
  result: z.enum(["PENDING", "PASS", "FAIL", "NA"]).optional(),
  defectReason: z.string().max(1000).optional().nullable(),
  photoUrl: z.string().max(2048).optional().nullable(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  const guard = await requireCan(req, "transition", "wo");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, patchSchema);
  if ("response" in body) return body.response;

  try {
    const row = await updateItem({
      id: params.itemId,
      qcCheckId: params.id,
      description: body.data.description,
      checkType: body.data.checkType,
      expectedValue: body.data.expectedValue ?? undefined,
      actualValue: body.data.actualValue ?? undefined,
      result: body.data.result,
      defectReason: body.data.defectReason ?? undefined,
      photoUrl: body.data.photoUrl ?? undefined,
      sortOrder: body.data.sortOrder,
      checkedBy: guard.session.userId,
    });
    if (!row) return jsonError("NOT_FOUND", "QC item không tồn tại.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "QC_CHECK",
      objectType: "qc_check_item",
      objectId: row.id,
      after: { result: row.result, actualValue: row.actualValue },
      notes: `QC item: ${row.result}`,
      ...meta,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error(
      { err, id: params.id, itemId: params.itemId },
      "update QC item failed",
    );
    return jsonError("INTERNAL", "Lỗi cập nhật QC item.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  const guard = await requireCan(req, "delete", "wo");
  if ("response" in guard) return guard.response;

  try {
    const ok = await deleteItem(params.id, params.itemId);
    if (!ok) return jsonError("NOT_FOUND", "QC item không tồn tại.", 404);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "qc_check_item",
      objectId: params.itemId,
      ...meta,
    });
    return NextResponse.json({ data: { id: params.itemId, deleted: true } });
  } catch (err) {
    logger.error(
      { err, id: params.id, itemId: params.itemId },
      "delete QC item failed",
    );
    return jsonError("INTERNAL", "Lỗi xóa QC item.", 500);
  }
}
