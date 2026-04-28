import { NextResponse, type NextRequest } from "next/server";
import { getBinContent } from "@/server/repos/warehouseLocation";
import { jsonError } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/warehouse/bins/[id] — chi tiết content (lots + items) của 1 bin. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return jsonError("INVALID_ID", "Bin id không hợp lệ", 400);
  }

  try {
    const content = await getBinContent(params.id);
    return NextResponse.json({ data: { binId: params.id, content } });
  } catch (e) {
    return jsonError(
      "BIN_CONTENT_FAILED",
      (e as Error).message ?? "Không lấy được nội dung bin",
      500,
    );
  }
}
