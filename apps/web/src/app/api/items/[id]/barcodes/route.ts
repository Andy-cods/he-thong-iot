import { NextResponse, type NextRequest } from "next/server";
import { barcodeCreateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getItemById } from "@/server/repos/items";
import {
  createBarcode,
  getBarcodeByValue,
  listBarcodes,
} from "@/server/repos/barcodes";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "item");
  if ("response" in guard) return guard.response;
  const rows = await listBarcodes(params.id);
  return NextResponse.json({ data: rows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "item");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, barcodeCreateSchema);
  if ("response" in body) return body.response;

  const item = await getItemById(params.id);
  if (!item) return jsonError("NOT_FOUND", "Không tìm thấy item.", 404);

  const dup = await getBarcodeByValue(body.data.barcode);
  if (dup)
    return jsonError(
      "BARCODE_DUPLICATE",
      `Barcode "${body.data.barcode}" đã tồn tại.`,
      409,
    );

  try {
    const row = await createBarcode(params.id, body.data);
    if (!row) throw new Error("createBarcode trả về undefined");
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "item_barcode",
      objectId: row.id,
      after: row,
      ...meta,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create barcode failed");
    return jsonError("INTERNAL", "Không thêm được barcode.", 500);
  }
}
