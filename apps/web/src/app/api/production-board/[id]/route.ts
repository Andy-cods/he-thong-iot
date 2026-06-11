import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  BoardItemNotFoundError,
  deleteBoardItem,
  updateBoardItem,
} from "@/server/repos/productionBoard";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOARD_STATUSES = [
  "QUEUED",
  "IN_PROGRESS",
  "QC",
  "COMPLETED",
  "DELIVERED",
] as const;

const patchSchema = z.object({
  productCode: z.string().min(1).max(128).optional(),
  rfqNo: z.string().max(64).nullish(),
  productName: z.string().min(1).max(2000).optional(),
  customer: z.string().max(64).nullish(),
  qtyPlanned: z.number().nonnegative().optional(),
  qtyDone: z.number().nonnegative().optional(),
  uom: z.string().max(24).nullish(),
  status: z.enum(BOARD_STATUSES).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  currentStage: z.string().max(128).nullish(),
  notes: z.string().max(2000).nullish(),
  isPinned: z.boolean().optional(),
  seq: z.number().int().nonnegative().optional(),
});

/**
 * PATCH /api/production-board/[id] — cập nhật mã hàng (chỉ qc + admin).
 * QC lead dùng để đổi trạng thái / SL đạt / công đoạn.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "productionBoard");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, patchSchema);
  if ("response" in body) return body.response;

  try {
    const row = await updateBoardItem(params.id, {
      ...body.data,
      userId: guard.session.userId,
    });
    return NextResponse.json({ data: row });
  } catch (err) {
    if (err instanceof BoardItemNotFoundError) {
      return jsonError("NOT_FOUND", err.message, 404);
    }
    logger.error({ err, id: params.id }, "update production board item failed");
    return jsonError("INTERNAL", "Lỗi cập nhật mã hàng.", 500);
  }
}

/**
 * DELETE /api/production-board/[id] — xóa mã hàng khỏi bảng (chỉ qc + admin).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "delete", "productionBoard");
  if ("response" in guard) return guard.response;

  try {
    await deleteBoardItem(params.id, guard.session.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BoardItemNotFoundError) {
      return jsonError("NOT_FOUND", err.message, 404);
    }
    logger.error({ err, id: params.id }, "delete production board item failed");
    return jsonError("INTERNAL", "Lỗi xóa mã hàng.", 500);
  }
}
