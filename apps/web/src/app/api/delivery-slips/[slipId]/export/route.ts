import { type NextRequest } from "next/server";
import { contentDispositionAttachment } from "@/lib/content-disposition";
import { logger } from "@/lib/logger";
import { jsonError, validateUuidParam } from "@/server/http";
import { getDeliverySlip } from "@/server/repos/deliverySlips";
import { buildDeliverySlipExcel } from "@/server/services/deliverySlipExcel";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Xuất phiếu giao ra .xlsx theo mẫu thật. Quyền: read bomTemplate. */
export async function GET(req: NextRequest, { params }: { params: { slipId: string } }) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.slipId);
  if ("response" in idCheck) return idCheck.response;
  try {
    const d = await getDeliverySlip(params.slipId);
    if (!d) return jsonError("NOT_FOUND", "Không tìm thấy phiếu giao.", 404);
    const buf = await buildDeliverySlipExcel(d);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDispositionAttachment(`${d.slip.slipNo}.xlsx`),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error({ err, slipId: params.slipId }, "export delivery slip failed");
    return jsonError("INTERNAL", "Không xuất được phiếu giao.", 500);
  }
}
