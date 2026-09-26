import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import {
  inventoryLotSerial,
  inventoryTxn,
  item as itemTable,
  locationBin,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError, parseJson } from "@/server/http";
import {
  assertIssuable,
  mapDbGuardError,
  postOutboundTxns,
} from "@/server/repos/stockGuard";
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
 *
 * V4.1 Đợt 1a (KHO-11/10/19):
 *  - MINUS BẮT BUỘC `lotSerialId` (dialog "Rút hàng" chọn lô nhưng trước đây
 *    không gửi → server trừ nhầm lô lớn nhất trong bin).
 *  - MINUS qua guard chung: khoá item → lô, không vượt tồn bin, không lấn
 *    phần đã giữ chỗ. Kho chỉ rút lô AVAILABLE; Giám đốc (admin) được rút cả
 *    lô HOLD (huỷ hàng hỏng/không đạt).
 *  - PLUS vào mã lô đang HOLD/EXPIRED → 409 (không trộn hàng mới vào lô bị
 *    giữ). Lô CONSUMED nhận thêm → mở lại AVAILABLE (nếu không, hàng cộng vào
 *    lô đã "hết" sẽ bị ẩn khỏi mọi luồng xuất).
 */
const schema = z.object({
  itemId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  type: z.enum(["PLUS", "MINUS"]),
  lotCode: z.string().trim().max(64).optional().nullable(),
  /** V4.1 KHO-11 — bắt buộc khi type=MINUS: lô cụ thể cần rút. */
  lotSerialId: z.string().uuid().optional().nullable(),
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

  const { itemId, qty, type, lotCode, lotSerialId: minusLotId, notes } =
    body.data;
  const binId = params.id;

  if (type === "MINUS" && !minusLotId) {
    return jsonError(
      "LOT_REQUIRED",
      "Giảm tồn phải chọn đúng lô cần rút (lotSerialId).",
      400,
    );
  }

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
            .select({
              id: inventoryLotSerial.id,
              status: inventoryLotSerial.status,
              holdCode: inventoryLotSerial.holdCode,
            })
            .from(inventoryLotSerial)
            .where(
              and(
                eq(inventoryLotSerial.itemId, itemId),
                eq(inventoryLotSerial.lotCode, lotCode.trim()),
                isNull(inventoryLotSerial.serialCode),
              ),
            )
            .limit(1)
            .for("update");
          if (existing) {
            if (existing.status === "HOLD" || existing.status === "EXPIRED") {
              throw new Error(
                existing.status === "HOLD"
                  ? `LOT_ON_HOLD: lô ${lotCode.trim()} đang bị giữ (${existing.holdCode === "QC_PENDING" ? "chờ QC" : existing.holdCode === "QC_FAIL" ? "QC không đạt" : "HOLD"}) — không cộng thêm hàng vào lô này, hãy dùng mã lô khác.`
                  : `LOT_ON_HOLD: lô ${lotCode.trim()} đã hết hạn — hãy dùng mã lô khác.`,
              );
            }
            if (existing.status === "CONSUMED") {
              await tx
                .update(inventoryLotSerial)
                .set({ status: "AVAILABLE" })
                .where(eq(inventoryLotSerial.id, existing.id));
            }
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
        // MINUS — V4.1 KHO-11: rút ĐÚNG lô user chọn, qua guard chung.
        // Admin (Giám đốc) được rút cả lô HOLD (huỷ hàng hỏng); ADJUST_MINUS
        // không bị trigger 0059 chặn nên phải chặn ở đây.
        lotSerialId = minusLotId!;
        const picks = [{ itemId, lotSerialId, binId, qty }];
        await assertIssuable(tx, picks, {
          allowStatuses: guard.session.roles.includes("admin")
            ? ["AVAILABLE", "HOLD"]
            : ["AVAILABLE"],
        });
        const posted = await postOutboundTxns(tx, picks, {
          txType: "ADJUST_MINUS",
          refTable: "manual_adjust",
          refId: null,
          postedBy: guard.session.userId,
          notes: notes ?? null,
        });
        return { txnId: posted.txnIds[0]!, lotSerialId };
      }
    });

    await writeAudit({
      actor: guard.session,
      action: type === "PLUS" ? "RECEIVE" : "ISSUE",
      objectType: "location_bin",
      objectId: binId,
      after: { itemId, qty, type, lotCode, lotSerialId: result.lotSerialId, notes },
      notes: `Manual adjust ${type} qty=${qty} bin=${bin.fullCode} sku=${it.sku}`,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const g = mapDbGuardError(err);
    if (g) return jsonError(g.code, g.message, g.status);
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    if (msg.startsWith("LOT_ON_HOLD")) {
      return jsonError("LOT_ON_HOLD", msg.replace(/^LOT_ON_HOLD:\s*/, ""), 409);
    }
    logger.error({ err, binId }, "bin adjust failed");
    return jsonError("ADJUST_FAILED", msg, 500);
  }
}
