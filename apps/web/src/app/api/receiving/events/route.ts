import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { item, purchaseOrder, purchaseOrderLine } from "@iot/db/schema";
import { receivingEventsBatchSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  getEventPostState,
  insertEvent,
  postReceivingAtomic,
} from "@/server/repos/receivingEvents";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { insertActivityLog } from "@/server/repos/activityLogs";
import { getPR } from "@/server/repos/purchaseRequests";
import {
  notifyPOReceivedFull,
  notifyPOReceivedPartial,
} from "@/server/services/notifications";
import { requireCan } from "@/server/session";
import { db } from "@/lib/db";
import { receivingScanCounter } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/receiving/events — V1.2 Phase B5.2.
 *
 * Batch scan events FE (Dexie queue replay). Flow per event:
 *   1. Idempotent insert vào receiving_event (scan_id unique)
 *   2. Nếu inserted mới → lookup PO + item + PO line
 *   3. Call postReceivingAtomic() → 7-table atomic chain + transition state
 *   4. Audit RECEIVE với qty + qcStatus + snapshot transition
 *
 * Trả { acked, rejected, count, details? } như V1.1-alpha để không phá
 * Dexie replay consumer.
 */
export async function POST(req: NextRequest) {
  // Receiving = warehouse transition PO (entity 'po', action 'transition').
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, receivingEventsBatchSchema);
  if ("response" in body) return body.response;

  const acked: string[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  // V3.16 (vấn đề 3) — dedupe trong phạm vi 1 batch request: nhiều event cùng
  // PO trong 1 lần post (vd over-delivery sau khi đã RECEIVED) không được bắn
  // lại notify nhiều lần. postReceivingAtomic tự trả poStatus mỗi lần gọi,
  // không tự nhớ đã notify chưa — route phải tự canh.
  const notifiedFullPoIds = new Set<string>();
  const notifiedPartialPoIds = new Set<string>();
  const details: Array<{
    id: string;
    poStatus?: string | null;
    newSnapshotState?: string | null;
    lotStatus?: string;
    overDelivery?: boolean;
    warning?: string | null;
  }> = [];
  const meta = extractRequestMeta(req);

  for (const e of body.data.events) {
    try {
      const result = await insertEvent({
        id: e.id,
        scanId: e.scanId,
        poCode: e.poCode,
        sku: e.sku,
        qty: e.qty,
        lotNo: e.lotNo ?? null,
        qcStatus: e.qcStatus,
        scannedAt: new Date(e.scannedAt),
        receivedBy: guard.session.userId,
        rawCode: e.rawCode ?? null,
        metadata: e.metadata ?? {},
      });

      // V3.11.3 (audit 1.2) — KHÔNG ack sớm ở đây. Trước đây `acked.push` chạy
      // ngay sau insertEvent (trước khi post tồn kho); nếu post fail thì event
      // vẫn tồn tại (scan_id đã tiêu) → replay lần sau `!inserted` → skip mãi
      // mãi → MẤT dữ liệu nhận hàng. Nay chỉ ack sau khi post thành công.
      if (!result.inserted) {
        // scan_id đã có sẵn — phân biệt duplicate thật vs event mồ côi.
        const state = await getEventPostState(e.scanId);
        if (state.posted) {
          // Đã post tồn kho ở lần trước → ack idempotent, không post lại.
          acked.push(e.id);
          continue;
        }
        // Event MỒ CÔI (lần trước insert xong nhưng post fail) → re-post bên dưới
        // để không mất dữ liệu. Rơi xuống nhánh lookup + postReceivingAtomic.
        logger.warn(
          { eventId: e.id, scanId: e.scanId },
          "receiving event mồ côi (insert cũ chưa post) — re-post",
        );
      }

      // Lookup PO + item + line
      const [po] = await db
        .select()
        .from(purchaseOrder)
        .where(eq(purchaseOrder.poNo, e.poCode))
        .limit(1);
      if (!po) {
        rejected.push({ id: e.id, reason: `PO ${e.poCode} không tồn tại` });
        continue;
      }
      const [itm] = await db
        .select()
        .from(item)
        .where(eq(item.sku, e.sku))
        .limit(1);
      if (!itm) {
        rejected.push({ id: e.id, reason: `SKU ${e.sku} không tồn tại` });
        continue;
      }
      // BUGFIX V1.9 P0: phải filter cả poId + itemId, tránh match nhầm PO
      // khác cũng chứa item này (trước đây eq(itemId) only → received_qty
      // cộng sai vào PO đầu tiên trong DB có chứa SKU, không phải PO đang
      // nhận hàng).
      const [poLine] = await db
        .select()
        .from(purchaseOrderLine)
        .where(
          and(
            eq(purchaseOrderLine.poId, po.id),
            eq(purchaseOrderLine.itemId, itm.id),
          ),
        )
        .limit(1);
      if (!poLine) {
        rejected.push({
          id: e.id,
          reason: `PO line cho SKU ${e.sku} không tồn tại trong PO ${e.poCode}`,
        });
        continue;
      }

      // Atomic 7-table post
      const posted = await postReceivingAtomic({
        scanEventId: e.id,
        poId: po.id,
        poLineId: poLine.id,
        itemId: itm.id,
        qty: e.qty,
        lotCode: e.lotNo ?? null,
        locationBinId: e.locationBinId ?? null,
        userId: guard.session.userId,
        qcStatus: e.qcStatus ?? "PENDING",
      });

      // V3.11.3 (audit 1.2) — chỉ ack SAU khi post tồn kho thành công.
      acked.push(e.id);

      details.push({
        id: e.id,
        poStatus: posted.poStatus,
        newSnapshotState: posted.newSnapshotState,
        lotStatus: posted.lotStatus,
        overDelivery: posted.overDelivery,
        warning: posted.overDelivery ? "Qty nhận > 105% ordered" : null,
      });

      receivingScanCounter.add(1, {
        qc_status: e.qcStatus ?? "PENDING",
        over_delivery: posted.overDelivery ? "true" : "false",
      });

      // V3.16 (vấn đề 3) — postReceivingAtomic có thể tự chuyển PO sang
      // RECEIVED (đủ hàng) hoặc PARTIAL (nhận 1 phần) nhưng trước đây route
      // này KHÔNG notify ai (khác route /receiving/[poId]/approve — flow
      // "duyệt thủ công" riêng, đã notifyPOReceivedFull sẵn — không trùng vì
      // route đó chặn khi PO đã RECEIVED).
      if (posted.poStatus === "RECEIVED" && !notifiedFullPoIds.has(po.id)) {
        notifiedFullPoIds.add(po.id);
        let prCreatorUserId: string | null = null;
        if (po.prId) {
          const pr = await getPR(po.prId).catch(() => null);
          prCreatorUserId = pr?.requestedBy ?? null;
        }
        void notifyPOReceivedFull({
          poId: po.id,
          poNo: po.poNo,
          supplierName: null,
          actorUserId: guard.session.userId,
          actorUsername: guard.session.username,
          prCreatorUserId,
        });
      } else if (
        posted.poStatus === "PARTIAL" &&
        !notifiedPartialPoIds.has(po.id)
      ) {
        notifiedPartialPoIds.add(po.id);
        void notifyPOReceivedPartial({
          poId: po.id,
          poNo: po.poNo,
          supplierName: null,
          actorUserId: guard.session.userId,
          actorUsername: guard.session.username,
        });
      }

      // Activity log cho PO (fire-and-forget)
      if (po) {
        void insertActivityLog({
          userId: guard.session.userId,
          entityType: "purchase_order",
          entityId: po.id,
          action: "MATERIAL_RECEIVED",
          diffJson: {
            sku: e.sku,
            qty: e.qty,
            qcStatus: e.qcStatus ?? "PENDING",
            newSnapshotState: posted.newSnapshotState,
            overDelivery: posted.overDelivery,
          },
        });
      }

      await writeAudit({
        actor: guard.session,
        action: "RECEIVE",
        objectType: "receiving_event",
        objectId: e.id,
        after: {
          poCode: e.poCode,
          sku: e.sku,
          qty: e.qty,
          lotNo: e.lotNo,
          qcStatus: e.qcStatus,
          newSnapshotState: posted.newSnapshotState,
          lotStatus: posted.lotStatus,
          poStatus: posted.poStatus,
        },
        notes: posted.overDelivery
          ? "Over-delivery > 105%"
          : undefined,
        ...meta,
      });
    } catch (err) {
      logger.warn({ err, eventId: e.id }, "receiving event post failed");
      rejected.push({
        id: e.id,
        reason: err instanceof Error ? err.message : "post failed",
      });
    }
  }

  return NextResponse.json({
    data: { acked, rejected, count: acked.length, details },
  });
}
