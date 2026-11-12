import { type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { jsonError, validateUuidParam } from "@/server/http";
import { getDeliverySlip } from "@/server/repos/deliverySlips";
import { renderDeliverySlipPdfBuffer } from "@/server/services/deliverySlipPdf";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PDF phiếu giao (A4 ngang) để xem/in trực tiếp. Quyền: read bomTemplate (như export Excel). */
export async function GET(req: NextRequest, { params }: { params: { slipId: string } }) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.slipId);
  if ("response" in idCheck) return idCheck.response;
  try {
    const d = await getDeliverySlip(params.slipId);
    if (!d) return jsonError("NOT_FOUND", "Không tìm thấy phiếu giao.", 404);
    const buf = await renderDeliverySlipPdfBuffer(d);
    const name = `${d.slip.slipNo}.pdf`.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new Response(new Blob([new Uint8Array(buf)], { type: "application/pdf" }), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error({ err, slipId: params.slipId }, "pdf delivery slip failed");
    return jsonError("INTERNAL", "Không xuất được PDF phiếu giao.", 500);
  }
}
