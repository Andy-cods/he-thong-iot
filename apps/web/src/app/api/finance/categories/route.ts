import { NextResponse, type NextRequest } from "next/server";
import { finCategoryCreateSchema, finCategoryListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  createFinCategory,
  getFinCategoryByCode,
  listFinCategories,
} from "@/server/repos/finCategories";
import { extractRequestMeta, jsonError, parseJson, parseSearchParams } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, finCategoryListQuerySchema);
  if ("response" in q) return q.response;
  const rows = await listFinCategories(q.data);
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "finance");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, finCategoryCreateSchema);
  if ("response" in body) return body.response;

  const dup = await getFinCategoryByCode(body.data.code);
  if (dup)
    return jsonError(
      "FIN_CATEGORY_CODE_DUPLICATE",
      `Mã danh mục "${body.data.code}" đã tồn tại.`,
      409,
    );
  try {
    const row = await createFinCategory(body.data);
    if (!row) throw new Error("createFinCategory trả về undefined");
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "fin_category",
      objectId: row.id,
      after: row,
      ...meta,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    const pgCode =
      (err as { code?: string; cause?: { code?: string } }).code ??
      (err as { cause?: { code?: string } }).cause?.code;
    if (pgCode === "23505") {
      return jsonError(
        "FIN_CATEGORY_CODE_DUPLICATE",
        `Mã danh mục "${body.data.code}" đã tồn tại.`,
        409,
      );
    }
    logger.error({ err }, "create fin category failed");
    return jsonError("INTERNAL", "Không tạo được danh mục.", 500);
  }
}
