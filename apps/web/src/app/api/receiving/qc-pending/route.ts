import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { countPendingQc, listPendingQc } from "@/server/repos/inboundQc";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.1 Đợt 1a — GET /api/receiving/qc-pending
 *
 * Danh sách dòng phiếu nhập chờ QC (PENDING) + không đạt (FAIL).
 * Query:
 *   - status=PENDING|FAIL|ALL (mặc định ALL)
 *   - q=…  tìm theo mã hàng / tên / số phiếu nhập / PO / mã lô
 *   - countOnly=1 → chỉ trả { pending, failed } cho badge.
 *
 * RBAC: `read:qcInspection` (admin, qc, warehouse).
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "qcInspection");
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  try {
    if (url.searchParams.get("countOnly") === "1") {
      const counts = await countPendingQc();
      return NextResponse.json({ data: counts });
    }
    const rawStatus = url.searchParams.get("status");
    const status =
      rawStatus === "PENDING" || rawStatus === "FAIL" ? rawStatus : "ALL";
    const q = url.searchParams.get("q");
    const [rows, counts] = await Promise.all([
      listPendingQc({ status, q }),
      countPendingQc(),
    ]);
    return NextResponse.json({ data: rows, meta: counts });
  } catch (err) {
    logger.error({ err }, "qc-pending list failed");
    return jsonError("INTERNAL", "Không tải được danh sách chờ QC.", 500);
  }
}
