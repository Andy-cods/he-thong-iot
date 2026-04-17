import { NextResponse, type NextRequest } from "next/server";
import { bomCheckCodeQuerySchema } from "@iot/shared";
import { checkCodeAvailable } from "@/server/repos/bomTemplates";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, bomCheckCodeQuerySchema);
  if ("response" in q) return q.response;

  try {
    const available = await checkCodeAvailable(q.data.code, q.data.excludeId);
    return NextResponse.json({ data: { available, code: q.data.code } });
  } catch {
    return jsonError("INTERNAL", "Lỗi kiểm tra mã BOM.", 500);
  }
}
