import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";
import { saveStocktakeCounts, StocktakeError } from "@/server/repos/stocktake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

const schema = z.object({
  counts: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        // null = xoá số đã đếm (đếm nhầm, để lại "chưa đếm").
        countedQty: z.number().min(0).nullable(),
        notes: z.string().trim().max(500).optional().nullable(),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * V4.3 Việc 2 — POST /api/warehouse/stocktake/[id]/counts
 *
 * Lưu nháp số đếm LIÊN TỤC (mỗi lần gọi ghi 1 batch — UI gọi debounce theo ô
 * đang gõ, không cần đợi xong cả phiên). Chỉ ghi được khi phiên đang DRAFT.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "stocktake");
  if ("response" in guard) return guard.response;

  if (!UUID_RE.test(params.id)) {
    return jsonError("INVALID_ID", "Id phiên kiểm kê không hợp lệ", 400);
  }

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  try {
    const updated = await saveStocktakeCounts(params.id, body.data.counts, guard.session.userId);
    return NextResponse.json({ data: { updated } });
  } catch (err) {
    if (err instanceof StocktakeError) return jsonError(err.code, err.message, 409);
    return jsonError("SAVE_COUNTS_FAILED", (err as Error).message ?? "Không lưu được số đếm", 500);
  }
}
