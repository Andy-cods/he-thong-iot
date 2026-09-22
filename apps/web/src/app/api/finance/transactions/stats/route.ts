import { NextResponse, type NextRequest } from "next/server";
import { finTransactionStatsQuerySchema } from "@iot/shared";
import { getFinTransactionStats } from "@/server/repos/finTransactions";
import { parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/finance/transactions/stats — tổng thu / tổng chi của TOÀN BỘ giao
 * dịch khớp bộ lọc (không phân trang), tính bằng SUM ở DB.
 *
 * Vì sao cần route riêng: trước đây màn "Thu chi" tự cộng tay trên
 * `?pageSize=1000`, nhưng zod giới hạn pageSize tối đa 200 → request trả 422
 * → 2 ô "Tổng đã thu / Tổng đã chi" LUÔN hiện 0đ dù bảng bên dưới có dữ liệu.
 * Bug thật, phát hiện khi chụp ảnh cho tài liệu hướng dẫn (2026-09-22).
 *
 * Tính ở DB còn bỏ luôn giới hạn "chỉ 1.000 giao dịch gần nhất" của cách cũ —
 * số liệu giờ chính xác tuyệt đối với mọi quy mô dữ liệu.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, finTransactionStatsQuerySchema);
  if ("response" in q) return q.response;

  const stats = await getFinTransactionStats(q.data);
  return NextResponse.json({ data: stats });
}
