import { NextResponse, type NextRequest } from "next/server";
import { bomTemplateCreateSchema, bomTemplateListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  checkCodeAvailable,
  createTemplate,
  listTemplates,
} from "@/server/repos/bomTemplates";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, bomTemplateListQuerySchema);
  if ("response" in q) return q.response;

  try {
    const page = q.data.page ?? 1;
    const pageSize = q.data.pageSize ?? 50;
    const result = await listTemplates({
      q: q.data.q,
      status: q.data.status as ("DRAFT" | "ACTIVE" | "OBSOLETE")[] | undefined,
      hasComponents:
        typeof q.data.hasComponents === "boolean"
          ? q.data.hasComponents
          : undefined,
      sort: q.data.sort ?? "updatedAt",
      sortDir: q.data.sortDir ?? "desc",
      page,
      pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      meta: { page, pageSize, total: result.total },
    });
  } catch (err) {
    logger.error({ err }, "list bom templates failed");
    return jsonError("INTERNAL", "Lỗi hệ thống khi tải danh sách BOM.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "bomTemplate");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bomTemplateCreateSchema);
  if ("response" in body) return body.response;

  const available = await checkCodeAvailable(body.data.code);
  if (!available) {
    return jsonError(
      "BOM_CODE_DUPLICATE",
      `Mã BOM "${body.data.code}" đã tồn tại.`,
      409,
    );
  }

  try {
    const row = await createTemplate(
      {
        code: body.data.code,
        name: body.data.name,
        description: body.data.description ?? null,
        parentItemId: body.data.parentItemId ?? null,
        targetQty: body.data.targetQty ?? 1,
      },
      guard.session.userId,
    );
    if (!row) return jsonError("INTERNAL", "Không tạo được BOM.", 500);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "bom_template",
      objectId: row.id,
      after: row,
      ...meta,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create bom template failed");
    return jsonError("INTERNAL", "Không tạo được BOM.", 500);
  }
}
