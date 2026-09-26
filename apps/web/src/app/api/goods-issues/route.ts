import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { jsonError, parseSearchParams } from "@/server/http";
import {
  GOODS_ISSUE_SOURCES,
  listGoodsIssues,
} from "@/server/repos/goodsIssues";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

const querySchema = z.object({
  sourceType: z
    .enum(GOODS_ISSUE_SOURCES as [string, ...string[]])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  from: DATE,
  to: DATE,
  q: z.string().trim().max(64).optional(),
  materialRequestId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(30),
});

/**
 * V4.1 Đợt 1b — GET /api/goods-issues — danh sách phiếu xuất kho (phân trang
 * server) cho tab Kho › "Phiếu xuất kho".
 * Lọc: sourceType (MATERIAL_REQUEST | QUICK_ISSUE | ISSUE_REQUEST), khoảng
 * ngày xuất from/to (giờ +07), q (số PX / tham chiếu), materialRequestId.
 * RBAC: `read:goodsIssue`.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "goodsIssue");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, querySchema);
  if ("response" in q) return q.response;

  try {
    const result = await listGoodsIssues({
      sourceType: q.data.sourceType as
        | "MATERIAL_REQUEST"
        | "QUICK_ISSUE"
        | "ISSUE_REQUEST"
        | undefined,
      from: q.data.from,
      to: q.data.to,
      q: q.data.q,
      materialRequestId: q.data.materialRequestId,
      page: q.data.page,
      pageSize: q.data.pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      meta: { page: q.data.page, pageSize: q.data.pageSize, total: result.total },
    });
  } catch (err) {
    logger.error({ err }, "list goods issues failed");
    return jsonError("GOODS_ISSUE_LIST_FAILED", "Không tải được danh sách phiếu xuất kho.", 500);
  }
}
