import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { inventoryTxn, locationBin } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.4 — POST /api/warehouse/bins/[id]/transfer
 *
 * Chuyển 1 lot từ bin này sang bin khác.
 *
 * Body:
 *   - lotSerialId: uuid
 *   - itemId: uuid
 *   - toBinId: uuid (target)
 *   - qty: number > 0
 *   - notes?: string
 *
 * Insert 1 row inventory_txn TRANSFER với fromBinId + toBinId.
 * View bin_inventory tự cộng/trừ.
 */
const schema = z.object({
  lotSerialId: z.string().uuid(),
  itemId: z.string().uuid(),
  toBinId: z.string().uuid(),
  qty: z.coerce.number().positive(),
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

  const fromBinId = params.id;
  const { lotSerialId, itemId, toBinId, qty, notes } = body.data;

  if (fromBinId === toBinId) {
    return jsonError("SAME_BIN", "Bin nguồn và đích không được trùng", 400);
  }

  // Validate both bins
  const [bins] = await db
    .select({
      fromCode: sql<string>`(SELECT full_code FROM app.location_bin WHERE id = ${fromBinId})`,
      toCode: sql<string>`(SELECT full_code FROM app.location_bin WHERE id = ${toBinId})`,
      toActive: sql<boolean>`(SELECT is_active FROM app.location_bin WHERE id = ${toBinId})`,
    })
    .from(locationBin)
    .limit(1);
  if (!bins?.fromCode || !bins?.toCode) {
    return jsonError("BIN_NOT_FOUND", "Không tìm thấy bin", 404);
  }
  if (!bins.toActive) {
    return jsonError("DEST_INACTIVE", "Bin đích đã bị vô hiệu", 409);
  }

  // Check qty available in source bin for this lot
  const onHandRows = await db.execute<{ qty: string }>(sql`
    SELECT qty_on_hand::text AS qty
    FROM app.bin_inventory
    WHERE bin_id = ${fromBinId}
      AND lot_serial_id = ${lotSerialId}
      AND item_id = ${itemId}
    LIMIT 1
  `);
  const onHand = Number(
    (onHandRows as unknown as Array<{ qty: string }>)[0]?.qty ?? "0",
  );
  if (onHand < qty) {
    return jsonError(
      "INSUFFICIENT",
      `Tồn ${onHand} < yêu cầu chuyển ${qty}`,
      409,
    );
  }

  try {
    const [txn] = await db
      .insert(inventoryTxn)
      .values({
        txType: "TRANSFER",
        itemId,
        qty: String(qty),
        fromBinId,
        toBinId,
        lotSerialId,
        refTable: "manual_transfer",
        postedBy: guard.session.userId,
        notes: notes ?? null,
      })
      .returning({ id: inventoryTxn.id });

    await writeAudit({
      actor: guard.session,
      action: "TRANSITION",
      objectType: "location_bin",
      objectId: fromBinId,
      after: { toBinId, lotSerialId, qty, notes },
      notes: `Transfer ${qty} ${bins.fromCode} → ${bins.toCode}`,
    });

    return NextResponse.json({ data: { txnId: txn?.id } });
  } catch (err) {
    return jsonError(
      "TRANSFER_FAILED",
      err instanceof Error ? err.message : "Không chuyển được",
      500,
    );
  }
}
