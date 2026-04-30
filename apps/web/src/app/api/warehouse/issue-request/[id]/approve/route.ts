import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import {
  inventoryLotSerial,
  inventoryTxn,
  warehouseIssueRequest,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyIssueRequestApproved } from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.9 — POST /api/warehouse/issue-request/[id]/approve
 *
 * Kho duyệt yêu cầu PENDING → APPROVED → tự động execute OUT_ISSUE inventory_txn
 * cho tất cả picks → status = COMPLETED.
 *
 * RBAC: warehouse / admin (transition po).
 */

interface PicksJson {
  itemId: string;
  sku?: string | null;
  picks: Array<{
    lotSerialId: string;
    binId: string;
    qty: number;
  }>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return jsonError("INVALID_ID", "ID không hợp lệ", 400);
  }

  // Load request
  const [request] = await db
    .select()
    .from(warehouseIssueRequest)
    .where(eq(warehouseIssueRequest.id, params.id))
    .limit(1);

  if (!request) return jsonError("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  if (request.status !== "PENDING") {
    return jsonError(
      "INVALID_STATUS",
      `Yêu cầu đã ${request.status}, không thể duyệt`,
      409,
    );
  }

  const lines = (request.picksJson as unknown as PicksJson[]) ?? [];

  try {
    const result = await db.transaction(async (tx) => {
      const txnIds: string[] = [];
      let totalQty = 0;
      let consumedLots = 0;

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

          const [txn] = await tx
            .insert(inventoryTxn)
            .values({
              txType: "OUT_ISSUE",
              itemId: line.itemId,
              qty: String(pick.qty),
              fromBinId: pick.binId,
              lotSerialId: pick.lotSerialId,
              refTable: "warehouse_issue_request",
              refId: request.id,
              postedBy: guard.session.userId,
              notes: `${request.requestNo} · approved`,
            })
            .returning({ id: inventoryTxn.id });

          txnIds.push(txn!.id);
          totalQty += pick.qty;

          // Auto CONSUMED nếu lot hết
          if (onHand === pick.qty) {
            const totalLeft = await tx.execute<{ total: string }>(sql`
              SELECT COALESCE(SUM(qty_on_hand), 0)::text AS total
              FROM app.bin_inventory
              WHERE lot_serial_id = ${pick.lotSerialId}
            `);
            const left = Number(
              (totalLeft as unknown as Array<{ total: string }>)[0]?.total ??
                "0",
            );
            if (left <= 0) {
              await tx
                .update(inventoryLotSerial)
                .set({ status: "CONSUMED" })
                .where(eq(inventoryLotSerial.id, pick.lotSerialId));
              consumedLots += 1;
            }
          }
        }
      }

      // Update request status
      const now = new Date();
      const [updated] = await tx
        .update(warehouseIssueRequest)
        .set({
          status: "COMPLETED",
          approvedBy: guard.session.userId,
          approvedAt: now,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(warehouseIssueRequest.id, params.id))
        .returning({
          id: warehouseIssueRequest.id,
          status: warehouseIssueRequest.status,
        });

      return { txnIds, totalQty, consumedLots, request: updated };
    });

    await writeAudit({
      actor: guard.session,
      action: "APPROVE",
      objectType: "warehouse_issue_request",
      objectId: params.id,
      after: {
        requestNo: request.requestNo,
        totalQty: result.totalQty,
        txnCount: result.txnIds.length,
      },
      notes: `Duyệt + xuất ${request.requestNo} · ${result.txnIds.length} pick · ${result.totalQty} qty`,
    });

    // V3.7.17 — Notify requester (Vận hành) về xuất kho thành công
    void notifyIssueRequestApproved({
      requestId: request.id,
      requestNo: request.requestNo,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
      requesterUserId: request.requestedBy,
      totalQty: result.totalQty,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi duyệt yêu cầu";
    return jsonError(
      "APPROVE_FAILED",
      msg,
      msg.startsWith("INSUFFICIENT") ? 409 : 500,
    );
  }
}
