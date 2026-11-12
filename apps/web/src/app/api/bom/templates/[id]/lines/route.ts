import { NextResponse, type NextRequest } from "next/server";
import { bomLineCreateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getTemplateById } from "@/server/repos/bomTemplates";
import { addLine } from "@/server/repos/bomLines";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";
import { loadLinesByIds } from "@/server/repos/bomTemplates";
import { publishBomEvent } from "@/server/services/bom-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BOM V5 / WP9 — GET ?ids=a,b,c: nạp lại đúng các dòng đổi (cùng shape tree)
 * để client vá cache khi nhận event realtime. Tối đa 200 id; id không tồn
 * tại/đã xoá thì vắng trong kết quả.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;
  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0 || ids.length > 200 || ids.some((i) => !/^[0-9a-f-]{36}$/i.test(i))) {
    return jsonError("VALIDATION_FAILED", "ids phải là 1-200 UUID, ngăn cách bằng dấu phẩy.", 422);
  }
  try {
    const lines = await loadLinesByIds(params.id, ids);
    return NextResponse.json({ data: { lines } });
  } catch (err) {
    logger.error({ err, id: params.id }, "load bom lines by ids failed");
    return jsonError("INTERNAL", "Không tải được các dòng.", 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  const template = await getTemplateById(params.id);
  if (!template) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  const body = await parseJson(req, bomLineCreateSchema);
  if ("response" in body) return body.response;

  try {
    const row = await addLine({
      templateId: params.id,
      parentLineId: body.data.parentLineId ?? null,
      componentItemId: body.data.componentItemId,
      qtyPerParent: body.data.qtyPerParent,
      scrapPercent: body.data.scrapPercent,
      position: body.data.position,
      uom: body.data.uom ?? null,
      description: body.data.description ?? null,
      supplierItemCode: body.data.supplierItemCode ?? null,
    });
    if (!row) return jsonError("INTERNAL", "Không tạo được linh kiện.", 500);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "bom_line",
      objectId: row.id,
      after: row,
      notes: `template=${params.id}`,
      ...meta,
    });
    publishBomEvent({
      templateId: params.id,
      lineIds: [row.id],
      kind: "line",
      actorId: guard.session.userId,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "MAX_DEPTH_EXCEEDED") {
      return jsonError(
        "MAX_DEPTH_EXCEEDED",
        "BOM không thể vượt quá 5 cấp.",
        422,
      );
    }
    if (e.code === "CYCLE_DETECTED") {
      return jsonError(
        "CYCLE_DETECTED",
        "Linh kiện này đã nằm trong nhánh cha — không thể tạo vòng lặp.",
        422,
      );
    }
    if (e.code === "PARENT_LINE_NOT_FOUND") {
      return jsonError(
        "PARENT_LINE_NOT_FOUND",
        "Không tìm thấy dòng cha.",
        404,
      );
    }
    if (e.code === "NO_PROJECT_SHEET") {
      return jsonError(
        "NO_PROJECT_SHEET",
        "BOM chưa có sheet PROJECT — không thể thêm linh kiện. Liên hệ admin.",
        422,
      );
    }
    logger.error({ err, id: params.id }, "add bom line failed");
    return jsonError("INTERNAL", "Không tạo được linh kiện.", 500);
  }
}
