import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { inventoryLotSerial, inventoryTxn } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.7 — POST /api/warehouse/issue
 *
 * Xuất hàng từ kho. Hỗ trợ multi-line + multi-pick per line.
 *
 * Body:
 *   - reason: string (REQUIRED) — production / sales / manual / loss / return
 *   - reference: string? — số chứng từ tham chiếu (WO, SO, ...)
 *   - notes: string?
 *   - lines: Array<{
 *       itemId: uuid,
 *       picks: Array<{ lotSerialId, binId, qty }>
 *     }>
 *
 * Logic per pick:
 *   1. Validate qty available trong (bin, lot, item) qua bin_inventory view
 *   2. INSERT inventory_txn OUT_ISSUE với fromBinId, lotSerialId, qty
 *   3. Nếu lot tiêu thụ hết → optional update status='CONSUMED' (V2)
 *
 * Atomic transaction: nếu 1 pick fail → rollback hết.
 */
const pickSchema = z.object({
  lotSerialId: z.string().uuid(),
  binId: z.string().uuid(),
  qty: z.coerce.number().positive(),
});

const lineSchema = z.object({
  itemId: z.string().uuid(),
  picks: z.array(pickSchema).min(1),
});

const issueSchema = z.object({
  reason: z
    .enum(["production", "sales", "manual", "loss", "return", "other"])
    .default("manual"),
  reference: z.string().trim().max(64).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1, "Cần ít nhất 1 dòng"),
});

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, issueSchema);
  if ("response" in body) return body.response;

  const { reason, reference, notes, lines } = body.data;

  try {
    const result = await db.transaction(async (tx) => {
      const txnIds: string[] = [];
      const issueRefId = crypto.randomUUID();
      let totalQty = 0;
      let consumedLots = 0;

      // V3.11.4 (audit 1.4) — advisory lock theo lot: serialize check-then-act
      // (đọc bin_inventory → INSERT OUT_ISSUE) để 2 issue đồng thời cùng bin/lot
      // không đều pass check → tránh tồn âm.
      // Review 2A-fix — lock TẤT CẢ lot phân biệt theo THỨ TỰ SORT ổn định TRƯỚC
      // vòng xử lý, thay vì lock rải rác theo thứ tự pick trong body. Nếu không,
      // 2 request chia sẻ ≥2 lot theo thứ tự ngược nhau → deadlock (40P01) → 500.
      const lockIds = [
        ...new Set(lines.flatMap((l) => l.picks.map((p) => p.lotSerialId))),
      ].sort();
      for (const lotId of lockIds) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext('lot:' || ${lotId}))`,
        );
      }

      for (const line of lines) {
        for (const pick of line.picks) {
          // Validate qty available
          const onHandRows = await tx.execute<{ qty: string }>(sql`
            SELECT qty_on_hand::text AS qty
            FROM app.bin_inventory
            WHERE bin_id = ${pick.binId}
              AND lot_serial_id = ${pick.lotSerialId}
              AND item_id = ${line.itemId}
            LIMIT 1
          `);
          const onHand = Number(
            (onHandRows as unknown as Array<{ qty: string }>)[0]?.qty ?? "0",
          );
          if (onHand < pick.qty) {
            throw new Error(
              `INSUFFICIENT: bin/lot có ${onHand} < yêu cầu ${pick.qty}`,
            );
          }

          // INSERT OUT_ISSUE
          const [txn] = await tx
            .insert(inventoryTxn)
            .values({
              txType: "OUT_ISSUE",
              itemId: line.itemId,
              qty: String(pick.qty),
              fromBinId: pick.binId,
              lotSerialId: pick.lotSerialId,
              refTable: `issue_${reason}`,
              refId: issueRefId,
              postedBy: guard.session.userId,
              notes:
                [reference, notes].filter(Boolean).join(" · ") || null,
            })
            .returning({ id: inventoryTxn.id });

          txnIds.push(txn!.id);
          totalQty += pick.qty;

          // Nếu sau pick này lot không còn qty trên bất cứ bin nào → CONSUMED
          if (onHand === pick.qty) {
            const totalLeftRows = await tx.execute<{ total: string }>(sql`
              SELECT COALESCE(SUM(qty_on_hand), 0)::text AS total
              FROM app.bin_inventory
              WHERE lot_serial_id = ${pick.lotSerialId}
            `);
            const totalLeft = Number(
              (totalLeftRows as unknown as Array<{ total: string }>)[0]
                ?.total ?? "0",
            );
            // sau khi insert OUT_ISSUE thì view sẽ trừ pick.qty.
            // Vì view aggregate trực tiếp từ inventory_txn, totalLeft đã là sau khi trừ.
            if (totalLeft <= 0) {
              await tx
                .update(inventoryLotSerial)
                .set({ status: "CONSUMED" })
                .where(eq(inventoryLotSerial.id, pick.lotSerialId));
              consumedLots += 1;
            }
          }
        }
      }

      return { txnIds, totalQty, consumedLots, issueRefId };
    });

    await writeAudit({
      actor: guard.session,
      action: "ISSUE",
      objectType: "inventory_txn",
      objectId: result.issueRefId,
      after: {
        reason,
        reference,
        lines: lines.length,
        totalQty: result.totalQty,
        txnCount: result.txnIds.length,
      },
      notes:
        notes ??
        `Xuất ${result.txnIds.length} pick · ${lines.length} SKU · ${result.totalQty} qty · ${reason}`,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi xuất hàng";
    return jsonError(
      "ISSUE_FAILED",
      msg,
      msg.startsWith("INSUFFICIENT") ? 409 : 500,
    );
  }
}

