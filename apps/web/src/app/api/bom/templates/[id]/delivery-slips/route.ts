import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { slipErrorResponse } from "@/server/deliverySlipHttp";
import { createDeliverySlip, listDeliverySlips } from "@/server/repos/deliverySlips";
import { notifySlipCreated } from "@/server/services/bom-stage-notify-send";
import { publishBomEvent } from "@/server/services/bom-events";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    kind: z.enum(["SURFACE", "ASSEMBLY"]),
    supplierId: z.string().uuid().nullish(),
    notes: z.string().max(1000).nullish(),
    lines: z
      .array(
        z.object({
          lineId: z.string().uuid(),
          /** Bỏ trống = toàn bộ SL đang có ở bước nguồn. */
          qty: z.number().positive().max(1e9).nullish(),
          unitPrice: z.number().min(0).max(1e12).nullish(),
          note: z.string().max(300).nullish(),
        }),
      )
      .min(1)
      .max(200),
  })
  .refine((b) => b.kind !== "SURFACE" || !!b.supplierId, {
    message: "Phiếu gửi nhà thầu phụ phải chọn nhà thầu phụ.",
    path: ["supplierId"],
  });

/**
 * BOM V5 / WP8 — tạo phiếu giao (SENT ngay, không duyệt) + chuyển bước trong
 * cùng transaction, all-or-nothing.
 * Quyền: `read bomTemplate` (cùng quyết định WP2/WP6: ai xem được BOM thì lập
 * được phiếu; matrix.ts không có action ghi riêng cho BOM V5).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  const body = await parseJson(req, bodySchema);
  if ("response" in body) return body.response;

  try {
    const r = await createDeliverySlip({
      templateId: params.id,
      ...body.data,
      actorId: guard.session.userId,
    });
    if (!r.ok) return slipErrorResponse(r.code, { index: r.index, lineId: r.lineId });
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "delivery_slip",
      objectId: r.slip.id,
      after: { slipNo: r.slip.slipNo, kind: r.slip.kind, lines: r.lines.length },
      notes: `Lập phiếu giao ${r.slip.slipNo}`,
      ...extractRequestMeta(req),
    });
    publishBomEvent({
      templateId: r.slip.templateId,
      lineIds: r.lines.map((l) => l.lineId),
      kind: "slip",
      actorId: guard.session.userId,
    });
    void notifySlipCreated(body.data.kind, r.slip, r.lines, {
      userId: guard.session.userId,
      fullName: guard.session.fullName,
      username: guard.session.username,
    });
    return NextResponse.json({ data: { slip: r.slip, lines: r.lines } }, { status: 201 });
  } catch (err) {
    logger.error({ err, templateId: params.id }, "create delivery slip failed");
    return jsonError("INTERNAL", "Không lập được phiếu giao.", 500);
  }
}

/** Danh sách phiếu của 1 BOM (mới nhất trước). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  try {
    return NextResponse.json({ data: await listDeliverySlips(params.id) });
  } catch (err) {
    logger.error({ err, templateId: params.id }, "list delivery slips failed");
    return jsonError("INTERNAL", "Không tải được danh sách phiếu giao.", 500);
  }
}
