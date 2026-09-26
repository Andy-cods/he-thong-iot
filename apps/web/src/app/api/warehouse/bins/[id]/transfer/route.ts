import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { inventoryTxn, locationBin } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError, parseJson } from "@/server/http";
import { StockGuardError, mapDbGuardError } from "@/server/repos/stockGuard";
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
 *
 * V4.1 Đợt 1a (KHO-13/19):
 *  - RBAC `update:inventory` (admin, warehouse) thay `transition:po` — trước
 *    đây Thu mua cũng chuyển bin được.
 *  - Bọc transaction + khoá item → lô (cùng thứ tự guard xuất) rồi mới đọc
 *    tồn bin → 2 lệnh chuyển/xuất song song không làm tồn bin âm.
 *  - Cho chuyển lô HOLD (cách ly hàng chờ QC/hỏng sang khu riêng). Không cho
 *    chuyển lô CONSUMED/EXPIRED.
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
  const guard = await requireCan(req, "update", "inventory");
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

  try {
    const txn = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.execute(sql`SELECT app.reservation_lock(${itemId}::uuid)`);
      const lotRows = (await tx.execute(sql`
        SELECT item_id::text AS item_id, status::text AS status, lot_code
        FROM app.inventory_lot_serial
        WHERE id = ${lotSerialId}
        FOR UPDATE
      `)) as unknown as Array<{
        item_id: string;
        status: string;
        lot_code: string | null;
      }>;
      const lot = lotRows[0];
      if (!lot) {
        throw new StockGuardError("LOT_NOT_FOUND", "Không tìm thấy lô cần chuyển.");
      }
      if (lot.item_id !== itemId) {
        throw new StockGuardError("ITEM_MISMATCH", "Lô không thuộc mã hàng đang chuyển.");
      }
      if (lot.status !== "AVAILABLE" && lot.status !== "HOLD") {
        throw new StockGuardError(
          "LOT_NOT_AVAILABLE",
          `Lô ${lot.lot_code ?? ""} đã ${lot.status === "CONSUMED" ? "xuất hết" : "hết hạn"} — không chuyển vị trí được.`,
        );
      }

      // Check qty available in source bin for this lot (sau khi giữ khoá)
      const onHandRows = await tx.execute<{ qty: string }>(sql`
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
        throw new StockGuardError(
          "INSUFFICIENT_BIN",
          `Tồn tại vị trí nguồn ${onHand} < yêu cầu chuyển ${qty}.`,
        );
      }

      const [row] = await tx
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
      return row;
    });

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
    const g = mapDbGuardError(err);
    if (g) return jsonError(g.code, g.message, g.status);
    logger.error({ err, fromBinId }, "bin transfer failed");
    return jsonError(
      "TRANSFER_FAILED",
      err instanceof Error ? err.message : "Không chuyển được",
      500,
    );
  }
}
