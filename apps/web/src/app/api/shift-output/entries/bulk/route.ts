import { NextResponse, type NextRequest } from "next/server";
import { shiftEntryBulkSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { extractRequestMeta, parseJson } from "@/server/http";
import { requireShiftOutput } from "@/server/shiftOutputScope";
import { createEntryFlow } from "@/server/shiftOutputHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/shift-output/entries/bulk — xả hàng đợi offline (≤50 dòng). MỖI dòng
 * chạy riêng (1 transaction/dòng, cùng luồng với POST /entries) → 1 dòng lỗi
 * không chặn các dòng khác. Luôn 200 + kết quả từng dòng:
 *   { results: [{ clientUuid, status: 201|200|409|422|404|500, id?, code?, message?, existingId? }] }
 */
export async function POST(req: NextRequest) {
  const guard = await requireShiftOutput(req, "create", "shiftOutput");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, shiftEntryBulkSchema);
  if ("response" in body) return body.response;
  const meta = extractRequestMeta(req);

  const results: Array<Record<string, unknown>> = [];
  for (const raw of body.data.entries) {
    const clientUuid = (raw as { clientUuid?: unknown } | null)?.clientUuid;
    try {
      const r = await createEntryFlow(guard.session, guard.scope, raw, meta);
      const data = r.body.data as { id?: string } | undefined;
      const error = r.body.error as { code?: string; message?: string; details?: { existingId?: string } } | undefined;
      results.push({
        clientUuid: r.clientUuid ?? (typeof clientUuid === "string" ? clientUuid : null),
        status: r.status,
        ...(data?.id ? { id: data.id } : {}),
        ...(error ? { code: error.code, message: error.message } : {}),
        ...(error?.details?.existingId ? { existingId: error.details.existingId } : {}),
      });
    } catch (err) {
      logger.error({ err, clientUuid }, "bulk shift entry failed");
      results.push({ clientUuid, status: 500, code: "INTERNAL", message: "Lỗi lưu dòng này, sẽ thử lại." });
    }
  }
  return NextResponse.json({ results });
}
