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
      // V3.11.4 (audit 1.3) — CLAIM request ngay đầu transaction: UPDATE có điều
      // kiện `status='PENDING'` returning. 2 duyệt đồng thời: chỉ 1 giành được
      // (1 row), cái còn lại 0 row → throw 409 (tránh xuất kho 2 lần cùng picks).
      const now = new Date();
      const claimed = await tx
        .update(warehouseIssueRequest)
        .set({
          status: "COMPLETED",
          approvedBy: guard.session.userId,
          approvedAt: now,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          sql`${warehouseIssueRequest.id} = ${params.id} AND ${warehouseIssueRequest.status} = 'PENDING'`,
        )
        .returning({
          id: warehouseIssueRequest.id,
          status: warehouseIssueRequest.status,
        });
      if (claimed.length === 0) {
        throw new Error("ALREADY_PROCESSED: yêu cầu đã được duyệt/xử lý");
      }

      const txnIds: string[] = [];
      let totalQty = 0;
      let consumedLots = 0;

      // V3.11.4 (audit 1.4) — advisory lock theo lot trước khi check-then-act để
      // 2 issue-request khác nhau không cùng rút quá tồn 1 lot.
      // Review 2A-fix — lock TẤT CẢ lot phân biệt theo THỨ TỰ SORT ổn định TRƯỚC
      // vòng xử lý (cùng namespace 'lot:' với /warehouse/issue) để 2 approve —
      // hoặc approve vs issue — chia sẻ ≥2 lot không deadlock (40P01 → 500).
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

      // Status đã set COMPLETED ở bước CLAIM đầu transaction.
      return { txnIds, totalQty, consumedLots, request: claimed[0] };
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
    const is409 =
      msg.startsWith("INSUFFICIENT") || msg.startsWith("ALREADY_PROCESSED");
    return jsonError("APPROVE_FAILED", msg, is409 ? 409 : 500);
  }
}
