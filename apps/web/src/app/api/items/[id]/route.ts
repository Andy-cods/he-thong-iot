import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { itemBarcode, itemSupplier, supplier } from "@iot/db/schema";
import { itemUpdateSchema } from "@iot/shared";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  getItemById,
  softDeleteItem,
  updateItem,
} from "@/server/repos/items";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit, diffObjects } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "item");
  if ("response" in guard) return guard.response;

  const row = await getItemById(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy item.", 404);

  const [barcodes, suppliers] = await Promise.all([
    db
      .select()
      .from(itemBarcode)
      .where(eq(itemBarcode.itemId, params.id)),
    db
      .select({
        id: itemSupplier.id,
        supplierId: itemSupplier.supplierId,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        supplierSku: itemSupplier.supplierSku,
        vendorItemCode: itemSupplier.vendorItemCode,
        priceRef: itemSupplier.priceRef,
        currency: itemSupplier.currency,
        leadTimeDays: itemSupplier.leadTimeDays,
        moq: itemSupplier.moq,
        packSize: itemSupplier.packSize,
        isPreferred: itemSupplier.isPreferred,
        createdAt: itemSupplier.createdAt,
      })
      .from(itemSupplier)
      .innerJoin(supplier, eq(supplier.id, itemSupplier.supplierId))
      .where(eq(itemSupplier.itemId, params.id)),
  ]);

  return NextResponse.json({
    data: { ...row, barcodes, suppliers },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "item");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, itemUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getItemById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy item.", 404);

  try {
    const after = await updateItem(params.id, body.data, guard.session.userId);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy item.", 404);
    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "item",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err, id: params.id }, "update item failed");
    return jsonError("INTERNAL", "Không cập nhật được item.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "delete", "item");
  if ("response" in guard) return guard.response;

  const before = await getItemById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy item.", 404);
  if (before.isActive === false) {
    return NextResponse.json({ data: { id: before.id, isActive: false } });
  }

  const after = await softDeleteItem(params.id, guard.session.userId);
  if (!after) return jsonError("NOT_FOUND", "Không tìm thấy item.", 404);
  const meta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "DELETE",
    objectType: "item",
    objectId: params.id,
    before: { isActive: true },
    after: { isActive: false },
    notes: "soft delete",
    ...meta,
  });
  return NextResponse.json({ data: { id: after.id, isActive: after.isActive } });
}
