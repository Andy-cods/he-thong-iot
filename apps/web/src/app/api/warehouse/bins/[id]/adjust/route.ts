import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import {
  inventoryLotSerial,
  inventoryTxn,
  item as itemTable,
  locationBin,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.4 — POST /api/warehouse/bins/[id]/adjust
 *
 * Cộng/trừ qty trực tiếp tại 1 bin (manual adjustment).
 *
 * Body:
 *   - itemId: uuid (required)
 *   - qty: number > 0
 *   - type: "PLUS" | "MINUS"
 *   - lotCode?: string (PLUS: tạo lot mới nếu chưa có; MINUS: phải khớp lot)
 *   - notes?: string
 *
 * Logic:
 *   - PLUS: tìm/tạo lot theo (item, lotCode); INSERT inventory_txn ADJUST_PLUS
 *           với toBinId = bin.
 *   - MINUS: tìm lot có qty_on_hand >= qty trong bin; INSERT ADJUST_MINUS
 *            với fromBinId = bin.
 *
 * RBAC: update inventory (warehouse, admin).
 */
const schema = z.object({
  itemId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  type: z.enum(["PLUS", "MINUS"]),
  lotCode: z.string().trim().max(64).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return jsonError("INVALID_ID", "Bin id không hợp lệ", 400);
  }

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  const { itemId, qty, type, lotCode, notes } = body.data;
  const binId = params.id;

  // Validate bin exists + active
  const [bin] = await db
    .select({
      id: locationBin.id,
      fullCode: locationBin.fullCode,
      isActive: locationBin.isActive,
    })
    .from(locationBin)
    .where(eq(locationBin.id, binId))
    .limit(1);
  if (!bin) return jsonError("BIN_NOT_FOUND", "Không tìm thấy bin", 404);
  if (!bin.isActive)
    return jsonError("BIN_INACTIVE", "Bin đã bị vô hiệu", 409);

  // Validate item exists
  const [it] = await db
    .select({ id: itemTable.id, sku: itemTable.sku })
    .from(itemTable)
    .where(eq(itemTable.id, itemId))
    .limit(1);
  if (!it) return jsonError("ITEM_NOT_FOUND", "Không tìm thấy SKU", 404);

  try {
    const result = await db.transaction(async (tx) => {
      let lotSerialId: string;

      if (type === "PLUS") {
        // Tìm/tạo lot
        if (lotCode && lotCode.trim()) {
          const [existing] = await tx
            .select({ id: inventoryLotSerial.id })
            .from(inventoryLotSerial)
            .where(
              and(
                eq(inventoryLotSerial.itemId, itemId),
                eq(inventoryLotSerial.lotCode, lotCode.trim()),
              ),
            )
            .limit(1);
          if (existing) {
            lotSerialId = existing.id;
          } else {
            const [newLot] = await tx
              .insert(inventoryLotSerial)
              .values({
                itemId,
                lotCode: lotCode.trim(),
                status: "AVAILABLE",
                notes: notes ?? "Manual adjust PLUS",
              })
              .returning({ id: inventoryLotSerial.id });
            lotSerialId = newLot!.id;
          }
        } else {
          // Anonymous lot
          const [newLot] = await tx
            .insert(inventoryLotSerial)
            .values({
              itemId,
              status: "AVAILABLE",
              supplierRef: `ADJ-${Date.now().toString(36).toUpperCase()}`,
              notes: notes ?? "Manual adjust PLUS (anon lot)",
            })
            .returning({ id: inventoryLotSerial.id });
          lotSerialId = newLot!.id;
        }

        const [txn] = await tx
          .insert(inventoryTxn)
          .values({
            txType: "ADJUST_PLUS",
            itemId,
            qty: String(qty),
            toBinId: binId,
            lotSerialId,
            refTable: "manual_adjust",
            postedBy: guard.session.userId,
            notes: notes ?? null,
          })
          .returning({ id: inventoryTxn.id });

        return { txnId: txn!.id, lotSerialId };
      } else {
        // MINUS — tìm lot có qty trong bin
        // Sử dụng bin_inventory view để pick lot có sẵn
        const lotsInBin = await tx.execute<{
          lot_serial_id: string;
          qty_on_hand: string;
        }>(sql`
          SELECT lot_serial_id, qty_on_hand::text
          FROM app.bin_inventory
          WHERE bin_id = ${binId} AND item_id = ${itemId}
          ORDER BY qty_on_hand DESC
          LIMIT 1
        `);
        const rows = lotsInBin as unknown as Array<{
          lot_serial_id: string;
          qty_on_hand: string;
        }>;

        if (rows.length === 0) {
          throw new Error(
            "NO_STOCK_IN_BIN: bin này không có tồn cho SKU đã chọn",
          );
        }

        const target = rows[0]!;
        const onHand = Number(target.qty_on_hand);
        if (onHand < qty) {
          throw new Error(
            `INSUFFICIENT: tồn ${onHand} < yêu cầu trừ ${qty}`,
          );
        }

        lotSerialId = target.lot_serial_id;

        const [txn] = await tx
          .insert(inventoryTxn)
          .values({
            txType: "ADJUST_MINUS",
            itemId,
            qty: String(qty),
            fromBinId: binId,
            lotSerialId,
            refTable: "manual_adjust",
            postedBy: guard.session.userId,
            notes: notes ?? null,
          })
          .returning({ id: inventoryTxn.id });

        return { txnId: txn!.id, lotSerialId };
      }
    });

    await writeAudit({
      actor: guard.session,
      action: type === "PLUS" ? "RECEIVE" : "ISSUE",
      objectType: "location_bin",
      objectId: binId,
      after: { itemId, qty, type, lotCode, notes },
      notes: `Manual adjust ${type} qty=${qty} bin=${bin.fullCode} sku=${it.sku}`,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return jsonError(
      "ADJUST_FAILED",
      msg,
      msg.startsWith("NO_STOCK") || msg.startsWith("INSUFFICIENT") ? 409 : 500,
    );
  }
}
