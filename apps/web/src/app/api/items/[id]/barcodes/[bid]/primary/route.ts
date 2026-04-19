import { NextResponse, type NextRequest } from "next/server";
import { getBarcode, setPrimaryBarcode } from "@/server/repos/barcodes";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; bid: string } },
) {
  const guard = await requireCan(req, "update", "item");
  if ("response" in guard) return guard.response;

  const before = await getBarcode(params.bid);
  if (!before || before.itemId !== params.id)
    return jsonError("NOT_FOUND", "Không tìm thấy barcode.", 404);

  const after = await setPrimaryBarcode(params.id, params.bid);
  if (!after) return jsonError("NOT_FOUND", "Không tìm thấy barcode.", 404);
  const meta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "UPDATE",
    objectType: "item_barcode",
    objectId: params.bid,
    before: { isPrimary: before.isPrimary },
    after: { isPrimary: true },
    notes: "set primary",
    ...meta,
  });
  return NextResponse.json({ data: after });
}
