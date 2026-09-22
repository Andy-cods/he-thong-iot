import { NextResponse, type NextRequest } from "next/server";
import { finCategoryUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getFinCategoryById, updateFinCategory } from "@/server/repos/finCategories";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { diffObjects, writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const row = await getFinCategoryById(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy danh mục.", 404);
  return NextResponse.json({ data: row });
}

/** PATCH dùng chung cho sửa tên/parent VÀ deactivate (isActive: false). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "finance");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, finCategoryUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getFinCategoryById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy danh mục.", 404);
  if (body.data.parentId === params.id) {
    return jsonError("FIN_CATEGORY_SELF_PARENT", "Danh mục không thể là cha của chính nó.", 422);
  }
  try {
    const after = await updateFinCategory(params.id, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy danh mục.", 404);
    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "fin_category",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update fin category failed");
    return jsonError("INTERNAL", "Không cập nhật được danh mục.", 500);
  }
}
