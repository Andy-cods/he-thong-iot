import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  BoardItemDuplicateError,
  countBoardByStatus,
  createBoardItem,
  listBoardItems,
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

/**
 * GET /api/production-board — danh sách mã hàng trên bảng + đếm theo trạng thái.
 * Tất cả role authed đều xem được (read). Dùng cho TV /board + widget homepage.
 *
 * Query:
 *   ?completedLimit=5  → số mã hoàn thành gần nhất giữ lại.
 *   ?all=1             → trả cả DELIVERED cũ (cho trang quản lý QC).
 *   ?missingPrice=1    → CHỈ vai `canSeeOrderValue` — lọc server-side các mã
 *                        CHƯA nhập đơn giá (link từ Tổng quan Tài chính).
 *                        KHÔNG trả `unitPrice` dù lọc theo field này.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "productionBoard");
  if ("response" in guard) return guard.response;

  try {
    const url = new URL(req.url);
    const completedLimit = Math.min(
      20,
      Math.max(0, Number(url.searchParams.get("completedLimit") ?? "5") || 5),
    );
    const includeDelivered = url.searchParams.get("all") === "1";

    const [items, counts] = await Promise.all([
      listBoardItems({ completedLimit, includeDelivered }),
      countBoardByStatus(),
    ]);

    // TASK-20261001 (việc 1) — bỏ cột "Giá trị"/"Tổng giá trị" khỏi UI (màn
    // chiếu TV xưởng không lộ giá) → danh sách KHÔNG trả `unitPrice` nữa cho
    // BẤT KỲ vai nào. Vai `canSeeOrderValue` lấy giá qua API chi tiết
    // GET /api/production-board/[id] (mở form Sửa) — xem route đó.
    const canSeePrice = canSeeOrderValue(guard.session.roles);
    const missingPriceOnly = canSeePrice && url.searchParams.get("missingPrice") === "1";
    const filtered = missingPriceOnly
      ? items.filter((it) => it.unitPrice === null || it.unitPrice === undefined)
      : items;
    const data = filtered.map(stripUnitPrice);
    return NextResponse.json({ data, counts });
  } catch (err) {
    logger.error({ err }, "list production board failed");
    return jsonError("INTERNAL", "Lỗi tải bảng sản xuất.", 500);
  }
}

const createSchema = z.object({
  productCode: z.string().min(1).max(128),
  rfqNo: z.string().max(64).nullish(),
  productName: z.string().min(1).max(2000),
  customer: z.string().max(64).nullish(),
  qtyPlanned: z.number().nonnegative().max(BOARD_QTY_MAX, BOARD_QTY_MAX_MESSAGE).optional().default(0),
  qtyDone: z.number().nonnegative().max(BOARD_QTY_MAX, BOARD_QTY_MAX_MESSAGE).optional().default(0),
  uom: z.string().max(24).nullish(),
  status: z.enum(BOARD_STATUSES).optional().default("QUEUED"),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  currentStage: z.string().max(128).nullish(),
  notes: z.string().max(2000).nullish(),
  isPinned: z.boolean().optional().default(false),
  seq: z.number().int().nonnegative().optional(),
  // V4.4.2 — Đơn giá bán. Vai không được xem tài chính đơn hàng gửi lên vẫn
  // bị BỎ QUA ở route (không throw lỗi — tránh vỡ luồng tạo mã hàng bình
  // thường của QC nếu client cũ/lỗi gửi kèm trường thừa).
  // V4.5 QA-C P2-1/QA-D P1-01 — chặn giá/SL phi thực tế (xem lib/production-board-policy.ts).
  unitPrice: z.number().nonnegative().max(BOARD_UNIT_PRICE_MAX, BOARD_UNIT_PRICE_MAX_MESSAGE).nullish(),
});

/** Bỏ `unitPrice` khỏi object trả về cho vai không được xem giá. */
function stripUnitPrice<T extends { unitPrice?: unknown }>(item: T): Omit<T, "unitPrice"> {
  const { unitPrice: _unitPrice, ...rest } = item;
  return rest;
}

/**
 * POST /api/production-board — tạo mã hàng mới (qc + admin + purchaser, V4.4).
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "productionBoard");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, createSchema);
  if ("response" in body) return body.response;

  const canSeePrice = canSeeOrderValue(guard.session.roles);

  try {
    const row = await createBoardItem({
      ...body.data,
      unitPrice: canSeePrice ? body.data.unitPrice : undefined,
      userId: guard.session.userId,
    });
    return NextResponse.json(
      { data: canSeePrice ? row : stripUnitPrice(row) },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof BoardItemDuplicateError) {
      return jsonError("DUPLICATE", err.message, 409);
    }
    logger.error({ err }, "create production board item failed");
    return jsonError("INTERNAL", "Lỗi tạo mã hàng.", 500);
  }
}
