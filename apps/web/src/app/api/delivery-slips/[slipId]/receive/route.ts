import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { slipErrorResponse } from "@/server/deliverySlipHttp";
import { receiveDeliverySlip } from "@/server/repos/deliverySlips";
import { publishBomEvent } from "@/server/services/bom-events";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  lines: z
    .array(
      z.object({
        slipLineId: z.string().uuid(),
        /** SL nhận THÊM lần này (cộng dồn). */
        qty: z.number().positive().max(1e9),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * Nhận hàng về từ nhà thầu phụ (chỉ phiếu SURFACE): cộng dồn Thực nhận (≤ chứng từ),
 * chuyển SURFACE→QC đúng SL nhận; thiếu ở lại SURFACE. Quyền: read bomTemplate.
 */
export async function POST(req: NextRequest, { params }: { params: { slipId: string } }) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.slipId);
  if ("response" in idCheck) return idCheck.response;
  const body = await parseJson(req, bodySchema);
  if ("response" in body) return body.response;
  try {
    const r = await receiveDeliverySlip(params.slipId, body.data.lines, guard.session.userId);
    if (!r.ok) return slipErrorResponse(r.code, { index: r.index, lineId: r.lineId });
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "delivery_slip",
      objectId: r.slip.id,
      after: { status: r.slip.status, received: body.data.lines.length },
      notes: `Nhận hàng về phiếu ${r.slip.slipNo}`,
      ...extractRequestMeta(req),
    });
    publishBomEvent({
      templateId: r.slip.templateId,
      lineIds: r.lines.map((l) => l.lineId),
      kind: "slip",
      actorId: guard.session.userId,
    });
    return NextResponse.json({ data: { slip: r.slip, lines: r.lines } });
  } catch (err) {
    logger.error({ err, slipId: params.slipId }, "receive delivery slip failed");
    return jsonError("INTERNAL", "Không ghi được thực nhận.", 500);
  }
}
