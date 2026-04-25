import { NextResponse, type NextRequest } from "next/server";
import { bomSheetCreateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getTemplateById } from "@/server/repos/bomTemplates";
import {
  createSheet,
  getSheetByName,
  listSheetsByTemplate,
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

/**
 * GET /api/bom/templates/[id]/sheets — list sheets của 1 BOM List.
 * Mọi role login đều xem được (cần để render tabs trong BOM detail).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  try {
    const template = await getTemplateById(params.id);
    if (!template) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

    const sheets = await listSheetsByTemplate(params.id);
    return NextResponse.json({ data: sheets });
  } catch (err) {
    logger.error({ err }, "list bom sheets failed");
    return jsonError("INTERNAL", "Lỗi tải danh sách sheet.", 500);
  }
}

/**
 * POST /api/bom/templates/[id]/sheets — tạo sheet mới trong BOM hiện có.
 * Permission update bomTemplate (admin/planner).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  const template = await getTemplateById(params.id);
  if (!template) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  // Không cho thêm sheet vào BOM đã RELEASE (immutable). Theo brainstorm Q6.
  if (template.status === "OBSOLETE") {
    return jsonError(
      "TEMPLATE_OBSOLETE",
      "Không thể thêm sheet vào BOM đã obsolete.",
      409,
    );
  }

  const body = await parseJson(req, bomSheetCreateSchema);
  if ("response" in body) return body.response;

  try {
    const existing = await getSheetByName(params.id, body.data.name);
    if (existing) {
      return jsonError(
        "DUPLICATE_NAME",
        `Tên sheet "${body.data.name}" đã tồn tại trong BOM này.`,
        409,
      );
    }

    const row = await createSheet({
      templateId: params.id,
      data: body.data,
      createdBy: guard.session.userId,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "bom_sheet",
      objectId: row.id,
      after: row,
      ...meta,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create bom sheet failed");
    return jsonError("INTERNAL", "Lỗi tạo sheet.", 500);
  }
}
