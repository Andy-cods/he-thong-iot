import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.9 — DEPRECATED (410 GONE). Route này duyệt tắt KHÔNG set approvalStep →
 * gãy timeline mục III/IV của phiếu YCVT. Dùng thay thế:
 *   - POST /dept-approve      (Trưởng bộ phận)
 *   - POST /director-approve  (Giám đốc/Mua hàng)
 *   - POST /quick-approve     (Admin gộp 2 cấp)
 */
export async function POST() {
  return jsonError(
    "GONE",
    "Endpoint đã ngưng. Dùng /dept-approve, /director-approve hoặc /quick-approve.",
    410,
  );
}
