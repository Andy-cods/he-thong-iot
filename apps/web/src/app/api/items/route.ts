import { NextResponse, type NextRequest } from "next/server";
import { itemCreateSchema, itemListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  checkSkuExists,
  createItem,
  listItems,
} from "@/server/repos/items";
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
  const guard = await requireCan(req, "read", "item");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, itemListQuerySchema);
  if ("response" in q) return q.response;

  try {
    const result = await listItems(q.data);
    return NextResponse.json({
      data: result.rows,
      meta: {
        page: q.data.page,
        pageSize: q.data.pageSize,
        total: result.total,
      },
    });
  } catch (err) {
    logger.error({ err }, "list items failed");
    return jsonError("INTERNAL", "Lỗi hệ thống khi tải danh sách.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "item");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, itemCreateSchema);
  if ("response" in body) return body.response;

  const existing = await checkSkuExists(body.data.sku);
  if (existing) {
    return jsonError(
      "SKU_DUPLICATE",
      `Mã "${body.data.sku}" đã tồn tại.`,
      409,
    );
  }

  try {
    const row = await createItem(body.data, guard.session.userId);
    if (!row) throw new Error("createItem trả về undefined");
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "item",
      objectId: row.id,
      after: row,
      ...meta,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create item failed");
    return jsonError("INTERNAL", "Không tạo được item.", 500);
  }
}
