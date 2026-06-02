import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { previewNextPaperFormNo } from "@/server/repos/purchaseRequests";
import { jsonError } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.69 YCVT — GET /api/purchase-requests/preview-form-no
 * Trả số phiếu kế tiếp `{seq}/PRD-MRF/{MMYY}` để hiển thị trên form tạo mới.
 *
 * Lưu ý: do generator dùng MAX(...)+1 nên gọi nhiều lần KHÔNG tăng counter.
 * Số thực sẽ "lock" khi user bấm "Gửi phiếu" (submitPR).
 */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if ("response" in session) return session.response;

  try {
    const no = await previewNextPaperFormNo();
    return NextResponse.json({ data: { paperFormNo: no } });
  } catch (err) {
    logger.error({ err }, "preview paper form no failed");
    return jsonError("INTERNAL", "Không lấy được số phiếu.", 500);
  }
}
