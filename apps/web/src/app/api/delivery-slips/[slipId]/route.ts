import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { jsonError, validateUuidParam } from "@/server/http";
import { getDeliverySlip } from "@/server/repos/deliverySlips";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chi tiết phiếu giao. Quyền: read bomTemplate (như lập phiếu). */
export async function GET(req: NextRequest, { params }: { params: { slipId: string } }) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.slipId);
  if ("response" in idCheck) return idCheck.response;
  try {
    const d = await getDeliverySlip(params.slipId);
    if (!d) return jsonError("NOT_FOUND", "Không tìm thấy phiếu giao.", 404);
    return NextResponse.json({ data: d });
  } catch (err) {
    logger.error({ err, slipId: params.slipId }, "get delivery slip failed");
    return jsonError("INTERNAL", "Không tải được phiếu giao.", 500);
  }
}
