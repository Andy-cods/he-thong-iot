import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
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
    // V4.4.2 — chỉ trả `unitPrice` cho vai xem được tài chính đơn hàng (lọc
    // Ở SERVER, không chỉ ẩn UI) — TV xưởng (/board, role display) và các vai
    // khác (qc/planner/operator/warehouse/shareholder) KHÔNG nhận trường này.
    const canSeePrice = canSeeOrderValue(guard.session.roles);
    const data = canSeePrice ? items : items.map(stripUnitPrice);
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
    logger.error({ err }, "create production board item failed");
    return jsonError("INTERNAL", "Lỗi tạo mã hàng.", 500);
  }
}
