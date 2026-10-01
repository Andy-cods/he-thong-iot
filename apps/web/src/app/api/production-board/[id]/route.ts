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
import {
  BOARD_QTY_MAX,
  BOARD_QTY_MAX_MESSAGE,
  BOARD_UNIT_PRICE_MAX,
  BOARD_UNIT_PRICE_MAX_MESSAGE,
  canSeeOrderValue,
} from "@/lib/production-board-policy";

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
  qtyPlanned: z.number().nonnegative().max(BOARD_QTY_MAX, BOARD_QTY_MAX_MESSAGE).optional(),
  qtyDone: z.number().nonnegative().max(BOARD_QTY_MAX, BOARD_QTY_MAX_MESSAGE).optional(),
  uom: z.string().max(24).nullish(),
  status: z.enum(BOARD_STATUSES).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  currentStage: z.string().max(128).nullish(),
  notes: z.string().max(2000).nullish(),
  isPinned: z.boolean().optional(),
  seq: z.number().int().nonnegative().optional(),
  // V4.4.2 — Đơn giá bán; bỏ qua ở route nếu actor không được xem giá (QC
  // toàn quyền sửa/xoá mã hàng nhưng KHÔNG phải vai xem tài chính đơn hàng).
  // V4.5 QA-C P2-1/QA-D P1-01 — chặn giá/SL phi thực tế (xem lib/production-board-policy.ts).
  unitPrice: z.number().nonnegative().max(BOARD_UNIT_PRICE_MAX, BOARD_UNIT_PRICE_MAX_MESSAGE).nullish(),
});

/** Bỏ `unitPrice` khỏi object trả về cho vai không được xem giá. */
function stripUnitPrice<T extends { unitPrice?: unknown }>(item: T): Omit<T, "unitPrice"> {
  const { unitPrice: _unitPrice, ...rest } = item;
  return rest;
}

/**
 * PATCH /api/production-board/[id] — cập nhật mã hàng (qc + admin; V4.4 xoá
 * `unitPrice` không nằm trong nhóm này — purchaser chỉ `create`, không `update`).
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

  const canSeePrice = canSeeOrderValue(guard.session.roles);

  try {
    const row = await updateBoardItem(params.id, {
      ...body.data,
      unitPrice: canSeePrice ? body.data.unitPrice : undefined,
      userId: guard.session.userId,
    });
    return NextResponse.json({ data: canSeePrice ? row : stripUnitPrice(row) });
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
