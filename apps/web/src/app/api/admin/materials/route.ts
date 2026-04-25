import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { materialMasterCreateSchema, MATERIAL_CATEGORIES } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  createMaterial,
  getMaterialByCode,
  listMaterials,
} from "@/server/repos/materialMaster";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  q: z.string().optional(),
  category: z.enum(["all", ...MATERIAL_CATEGORIES]).optional(),
  isActive: z.coerce.boolean().optional(),
  sort: z
    .enum(["code", "nameVn", "category", "pricePerKg", "createdAt"])
    .optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "admin");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, listQuerySchema);
  if ("response" in q) return q.response;

  try {
    const result = await listMaterials({
      q: q.data.q,
      category: q.data.category,
      isActive: q.data.isActive,
      sort: q.data.sort,
      order: q.data.order,
      page: q.data.page,
      pageSize: q.data.pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    });
  } catch (err) {
    logger.error({ err }, "list materials failed");
    return jsonError("INTERNAL", "Lỗi tải danh sách vật liệu.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "admin");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, materialMasterCreateSchema);
  if ("response" in body) return body.response;

  try {
    // Check duplicate code (UNIQUE constraint sẽ throw nhưng UX tốt hơn nếu trả 409).
    const existing = await getMaterialByCode(body.data.code);
    if (existing) {
      return jsonError(
        "DUPLICATE_CODE",
        `Mã '${body.data.code}' đã tồn tại.`,
        409,
      );
    }

    const row = await createMaterial(body.data, guard.session.userId);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "material_master",
      objectId: row.id,
      after: row,
      ...meta,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create material failed");
    return jsonError("INTERNAL", "Lỗi tạo vật liệu.", 500);
  }
}
