import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import {
  getAffectedOrders,
  getECOByCode,
} from "@/server/repos/ecoChanges";
import { jsonError } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  try {
    const eco = await getECOByCode(params.code);
    if (!eco) return jsonError("NOT_FOUND", "ECO không tồn tại.", 404);
    const orders = await getAffectedOrders(eco.affectedTemplateId);
    return NextResponse.json({ data: orders, meta: { total: orders.length } });
  } catch (err) {
    logger.error({ err }, "affected orders failed");
    return jsonError("INTERNAL", "Lỗi tải affected orders.", 500);
  }
}
