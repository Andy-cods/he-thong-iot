import { NextResponse, type NextRequest } from "next/server";
import { SHIFT_LIST_MAX_DAYS, shiftEntryListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { diffDays } from "@/lib/shift-output/shift-window";
import { extractRequestMeta, jsonError, parseSearchParams } from "@/server/http";
import { pickSite, requireShiftOutput } from "@/server/shiftOutputScope";
import { createEntryFlow, toResponse, withLock } from "@/server/shiftOutputHttp";
import { listEntries } from "@/server/repos/shiftOutputEntries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/shift-output/entries — lọc tối đa 31 ngày / 200 dòng (Lịch sử). */
export async function GET(req: NextRequest) {
  const guard = await requireShiftOutput(req, "read", "shiftOutput");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, shiftEntryListQuerySchema);
  if ("response" in q) return q.response;
  const span = diffDays(q.data.from, q.data.to);
  if (span < 0) return jsonError("INVALID_RANGE", "Ngày bắt đầu phải trước ngày kết thúc.", 422);
  if (span + 1 > SHIFT_LIST_MAX_DAYS) {
    return jsonError("RANGE_TOO_LARGE", `Chỉ xem tối đa ${SHIFT_LIST_MAX_DAYS} ngày một lần.`, 422);
  }
  const picked = await pickSite(guard.scope, q.data.siteId);
  if ("response" in picked) return picked.response;
  try {
    const { rows, truncated } = await listEntries(picked.site.id, q.data);
    const now = new Date();
    return NextResponse.json({ data: rows.map((r) => withLock(r, picked.site, now)), meta: { truncated } });
  } catch (err) {
    logger.error({ err }, "list shift entries failed");
    return jsonError("INTERNAL", "Lỗi tải danh sách sản lượng.", 500);
  }
}

/**
 * POST /api/shift-output/entries — tạo 1 dòng. Idempotent theo `clientUuid`
 * (gửi lại → 200 `replayed`); trùng slot → 409 DUPLICATE_SLOT + existingId.
 */
export async function POST(req: NextRequest) {
  const guard = await requireShiftOutput(req, "create", "shiftOutput");
  if ("response" in guard) return guard.response;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError("INVALID_JSON", "Dữ liệu gửi lên không hợp lệ (không đọc được JSON).", 400);
  }
  try {
    const { clientUuid: _c, ...r } = await createEntryFlow(guard.session, guard.scope, raw, extractRequestMeta(req));
    return toResponse(r);
  } catch (err) {
    logger.error({ err }, "create shift entry failed");
    return jsonError("INTERNAL", "Lỗi lưu sản lượng.", 500);
  }
}
