import { NextResponse, type NextRequest } from "next/server";
import { barcodeUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  deleteBarcode,
  getBarcode,
  updateBarcode,
} from "@/server/repos/barcodes";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; bid: string } },
) {
  const guard = await requireSession(req, "warehouse", "planner");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, barcodeUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getBarcode(params.bid);
  if (!before || before.itemId !== params.id)
    return jsonError("NOT_FOUND", "Không tìm thấy barcode.", 404);

  try {
    const after = await updateBarcode(params.id, params.bid, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy barcode.", 404);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "item_barcode",
      objectId: params.bid,
      before,
      after,
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update barcode failed");
    return jsonError("INTERNAL", "Không cập nhật được barcode.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; bid: string } },
) {
  const guard = await requireSession(req, "warehouse", "planner");
  if ("response" in guard) return guard.response;

  const before = await getBarcode(params.bid);
  if (!before || before.itemId !== params.id)
    return jsonError("NOT_FOUND", "Không tìm thấy barcode.", 404);

  const row = await deleteBarcode(params.id, params.bid);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy barcode.", 404);
  const meta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "DELETE",
    objectType: "item_barcode",
    objectId: params.bid,
    before,
    ...meta,
  });
  return NextResponse.json({ data: { id: row.id } });
}
