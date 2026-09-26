import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import {
  listAssemblyConsumeWithoutBin,
  listMrDeliveredWithoutIssue,
} from "@/server/repos/stockReports";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.1 Đợt 1c (D4) — GET /api/warehouse/reports/reconciliation
 *
 * Báo cáo "Đối soát trước kiểm kê" — CHỈ ĐỌC, không sửa tồn (D4: kiểm kê
 * thực tế rồi điều chỉnh, KHÔNG tự trừ tồn lịch sử):
 *   - mrDelivered: phiếu yêu cầu vật tư DELIVERED trước Đợt 1b (không phiếu
 *     xuất, chưa trừ tồn) — chi tiết + tổng theo mã + tồn hệ thống.
 *   - outboundWithoutBin: txn xuất không có bin (tồn theo bin chưa trừ).
 * RBAC: `read:inventory` (admin, warehouse).
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "inventory");
  if ("response" in guard) return guard.response;

  try {
    const [mrDelivered, outboundWithoutBin] = await Promise.all([
      listMrDeliveredWithoutIssue(),
      listAssemblyConsumeWithoutBin(),
    ]);
    return NextResponse.json({
      data: {
        generatedAt: new Date().toISOString(),
        mrDelivered,
        outboundWithoutBin,
      },
    });
  } catch (err) {
    logger.error({ err }, "warehouse reconciliation report failed");
    return jsonError(
      "RECONCILIATION_FAILED",
      "Không tải được báo cáo đối soát.",
      500,
    );
  }
}
