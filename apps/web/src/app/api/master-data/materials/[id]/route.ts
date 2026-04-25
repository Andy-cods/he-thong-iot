import { NextResponse, type NextRequest } from "next/server";
import { materialMasterUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  countItemsUsingMaterial,
  deactivateMaterial,
  getMaterialById,
  updateMaterial,
} from "@/server/repos/materialMaster";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Read open cho mọi role login (BOM editor cần load detail).
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  try {
    const row = await getMaterialById(params.id);
    if (!row) return jsonError("NOT_FOUND", "Không tìm thấy vật liệu.", 404);
    const usedCount = await countItemsUsingMaterial(row.code);
    return NextResponse.json({ data: { ...row, usedByItemCount: usedCount } });
  } catch (err) {
    logger.error({ err }, "get material failed");
    return jsonError("INTERNAL", "Lỗi tải vật liệu.", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "admin", "planner");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, materialMasterUpdateSchema);
  if ("response" in body) return body.response;

  try {
    const before = await getMaterialById(params.id);
    if (!before)
      return jsonError("NOT_FOUND", "Không tìm thấy vật liệu.", 404);

    const after = await updateMaterial(params.id, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy vật liệu.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "material_master",
      objectId: after.id,
      before,
      after,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update material failed");
    return jsonError("INTERNAL", "Lỗi cập nhật vật liệu.", 500);
  }
}

/**
 * DELETE = soft delete (set isActive=false). Không xóa thật để bảo vệ FK
 * `item.material_code`. Nếu cần xóa cứng → ưu tiên cập nhật item refs trước
 * rồi mới xóa qua admin tool / migration.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "admin", "planner");
  if ("response" in guard) return guard.response;

  try {
    const before = await getMaterialById(params.id);
    if (!before)
      return jsonError("NOT_FOUND", "Không tìm thấy vật liệu.", 404);

    const usedCount = await countItemsUsingMaterial(before.code);

    const after = await deactivateMaterial(params.id);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy vật liệu.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "material_master",
      objectId: after.id,
      before,
      after,
      ...meta,
    });

    return NextResponse.json({
      data: after,
      warning:
        usedCount > 0
          ? `Lưu ý: ${usedCount} vật tư đang dùng vật liệu này — vẫn giữ FK nhưng vật liệu đã ẩn khỏi UI.`
          : null,
    });
  } catch (err) {
    logger.error({ err }, "delete material failed");
    return jsonError("INTERNAL", "Lỗi xoá vật liệu.", 500);
  }
}
