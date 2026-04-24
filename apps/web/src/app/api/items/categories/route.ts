import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { listItemCategories } from "@/server/repos/items";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V1.9 P6 — GET /api/items/categories
 *
 * Trả về list distinct categories cùng số lượng items per category.
 * Dùng cho Filter dropdown "Danh mục" trong /items page.
 *
 * Response: { data: [{ category: string, count: number }, ...] }
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "item");
  if ("response" in guard) return guard.response;

  try {
    const categories = await listItemCategories();
    return NextResponse.json({ data: categories });
  } catch (err) {
    logger.error({ err }, "list item categories failed");
    return jsonError("INTERNAL", "Lỗi hệ thống khi tải danh mục.", 500);
  }
}
