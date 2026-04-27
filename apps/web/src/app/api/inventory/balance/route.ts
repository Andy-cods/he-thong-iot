/**
 * GET /api/inventory/balance — TASK-20260427-017.
 *
 * Trả balance per-SKU: { onHand, reserved, available, holdQty }.
 *
 * - `onHand` compute từ `inventory_txn` (schema gap: lot_serial KHÔNG có cột qty).
 * - `reserved` từ `reservation` ACTIVE.
 * - `holdQty` aggregate cho lot status='HOLD' (chờ QC).
 * - `available = max(0, onHand - reserved)`.
 *
 * RBAC: `read` `item` (mọi role có read item đều xem được tồn kho).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { jsonError, parseSearchParams } from "@/server/http";
import { getInventoryBalance } from "@/server/repos/inventory";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  itemId: z.string().uuid().optional(),
  /** Mặc định false → trả full danh mục (kể cả SKU chưa có lot, hữu ích cho UI tổng quan). */
  hasLotOnly: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(100),
});

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "item");
  if ("response" in guard) return guard.response;

  const parsed = parseSearchParams(req, querySchema);
  if ("response" in parsed) return parsed.response;

  const { itemId, hasLotOnly, page, pageSize } = parsed.data;

  try {
    const { rows, total } = await getInventoryBalance({
      itemIds: itemId ? [itemId] : undefined,
      hasLotOnly,
      page,
      pageSize,
    });

    return NextResponse.json({
      data: rows,
      meta: { page, pageSize, total },
    });
  } catch (err) {
    logger.error({ err }, "inventory balance query failed");
    return jsonError("INTERNAL", "Không tải được số dư kho.", 500);
  }
}
