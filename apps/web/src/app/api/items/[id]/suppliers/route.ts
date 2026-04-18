import { NextResponse, type NextRequest } from "next/server";
import { itemSupplierCreateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getItemById } from "@/server/repos/items";
import { getSupplierById } from "@/server/repos/suppliers";
import {
  createItemSupplier,
  getItemSupplierPair,
  listItemSuppliers,
} from "@/server/repos/itemSuppliers";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "planner", "warehouse");
  if ("response" in guard) return guard.response;
  const rows = await listItemSuppliers(params.id);
  return NextResponse.json({ data: rows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "planner");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, itemSupplierCreateSchema);
  if ("response" in body) return body.response;

  const item = await getItemById(params.id);
  if (!item) return jsonError("NOT_FOUND", "Không tìm thấy item.", 404);
  const sup = await getSupplierById(body.data.supplierId);
  if (!sup) return jsonError("SUPPLIER_NOT_FOUND", "Không tìm thấy NCC.", 404);

  const dup = await getItemSupplierPair(params.id, body.data.supplierId);
  if (dup)
    return jsonError(
      "ITEM_SUPPLIER_DUPLICATE",
      "NCC này đã gắn với item.",
      409,
    );

  try {
    const row = await createItemSupplier(params.id, body.data);
    if (!row) throw new Error("createItemSupplier trả về undefined");
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "item_supplier",
      objectId: row.id,
      after: row,
      ...meta,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create item_supplier failed");
    return jsonError("INTERNAL", "Không gắn được NCC.", 500);
  }
}
