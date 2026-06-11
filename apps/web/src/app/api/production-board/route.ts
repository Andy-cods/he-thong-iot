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
    return NextResponse.json({ data: items, counts });
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
  qtyPlanned: z.number().nonnegative().optional().default(0),
  qtyDone: z.number().nonnegative().optional().default(0),
  uom: z.string().max(24).nullish(),
  status: z.enum(BOARD_STATUSES).optional().default("QUEUED"),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  currentStage: z.string().max(128).nullish(),
  notes: z.string().max(2000).nullish(),
  isPinned: z.boolean().optional().default(false),
  seq: z.number().int().nonnegative().optional(),
});

/**
 * POST /api/production-board — tạo mã hàng mới (chỉ qc + admin).
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "productionBoard");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, createSchema);
  if ("response" in body) return body.response;

  try {
    const row = await createBoardItem({
      ...body.data,
      userId: guard.session.userId,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create production board item failed");
    return jsonError("INTERNAL", "Lỗi tạo mã hàng.", 500);
  }
}
