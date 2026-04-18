import { and, desc, eq, sql } from "drizzle-orm";
import {
  bomSnapshotLine,
  inboundReceipt,
  inboundReceiptLine,
  inventoryLotSerial,
  inventoryTxn,
  purchaseOrder,
  purchaseOrderLine,
  receivingEvent,
} from "@iot/db/schema";
import { db } from "@/lib/db";

export interface ReceivingEventInsertInput {
  id: string;
  scanId: string;
  poCode: string;
  sku: string;
  qty: number;
  lotNo?: string | null;
  qcStatus?: "OK" | "NG" | "PENDING";
  scannedAt: Date;
  receivedBy?: string | null;
  rawCode?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ReceivingInsertResult {
  id: string;
  inserted: boolean; // true nếu row mới, false nếu đã tồn tại (scan_id conflict)
}

/**
 * Idempotent insert: ON CONFLICT DO NOTHING theo scan_id unique.
 * Response xác định rõ inserted vs duplicate để FE mark synced.
 */
export async function insertEvent(
  input: ReceivingEventInsertInput,
): Promise<ReceivingInsertResult> {
  const rows = await db.execute(sql`
    INSERT INTO app.receiving_event
      (id, scan_id, po_code, sku, qty, lot_no, qc_status, scanned_at, received_by, raw_code, metadata)
    VALUES
      (${input.id}, ${input.scanId}, ${input.poCode}, ${input.sku}, ${input.qty},
       ${input.lotNo ?? null}, ${input.qcStatus ?? "PENDING"}, ${input.scannedAt.toISOString()},
       ${input.receivedBy ?? null}, ${input.rawCode ?? null},
       ${JSON.stringify(input.metadata ?? {})}::jsonb)
    ON CONFLICT (scan_id) DO NOTHING
    RETURNING id
  `);
  const list = rows as unknown as Array<{ id: string }>;
  return {
    id: input.id,
    inserted: list.length > 0,
  };
}

export async function listEventsByPo(poCode: string, limit = 100) {
  return db
    .select()
    .from(receivingEvent)
    .where(eq(receivingEvent.poCode, poCode))
    .orderBy(desc(receivingEvent.scannedAt))
    .limit(limit);
}

/**
 * V1.2 — Atomic 7-table receiving event post.
 *
 * 1) INSERT receiving_event (nếu chưa có — idempotent scan_id)
 * 2) Tìm/tạo inbound_receipt (1 per PO + ngày) + inbound_receipt_line
 * 3) Tìm/tạo inventory_lot_serial (theo lot_code + item_id)
 * 4) INSERT inventory_txn tx_type=IN_RECEIPT
 * 5) UPDATE purchase_order_line.received_qty += qty
 * 6) UPDATE bom_snapshot_line.received_qty += qty (qua po_line.snapshot_line_id)
 * 7) (QC flow) transition state PURCHASING → INBOUND_QC (nếu applicable)
 *
 * Tất cả atomic trong 1 Drizzle transaction. Trả về chi tiết kết quả.
 */
export interface PostReceivingInput {
  scanEventId: string; // id của receiving_event (đã insert)
  poId: string;
  poLineId: string;
  itemId: string;
  qty: number;
  lotCode?: string | null;
  serialCode?: string | null;
  locationBinId?: string | null;
  userId: string | null;
  notes?: string | null;
}

export interface PostReceivingResult {
  receiptLineId: string;
  inventoryTxnId: string;
  lotSerialId: string;
  snapshotLineUpdated: boolean;
  newSnapshotState: string | null;
}

export async function postReceivingAtomic(
  input: PostReceivingInput,
): Promise<PostReceivingResult> {
  return db.transaction(async (tx) => {
    // 1) Validate PO line
    const [poLine] = await tx
      .select()
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.id, input.poLineId))
      .limit(1);
    if (!poLine) throw new Error("PO_LINE_NOT_FOUND");

    // 2) Find/create inbound_receipt header (1 per po + ngày)
    const today = new Date().toISOString().slice(0, 10);
    const [existingHeader] = await tx
      .select()
      .from(inboundReceipt)
      .where(
        and(
          eq(inboundReceipt.poId, input.poId),
          sql`${inboundReceipt.receivedAt}::date = ${today}::date`,
        ),
      )
      .limit(1);

    let receiptId: string;
    if (existingHeader) {
      receiptId = existingHeader.id;
    } else {
      const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
      const cntRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS c FROM app.inbound_receipt
        WHERE receipt_no LIKE ${`RCV-${yymm}-%`}
      `);
      const cnt = (cntRows as unknown as Array<{ c: number }>)[0]?.c ?? 0;
      const receiptNo = `RCV-${yymm}-${(cnt + 1).toString().padStart(4, "0")}`;

      const [newHeader] = await tx
        .insert(inboundReceipt)
        .values({
          receiptNo,
          poId: input.poId,
          receivedBy: input.userId,
          qcFlag: "PENDING",
        })
        .returning();
      if (!newHeader) throw new Error("RECEIPT_INSERT_FAILED");
      receiptId = newHeader.id;
    }

    // 3) Insert inbound_receipt_line
    const [receiptLine] = await tx
      .insert(inboundReceiptLine)
      .values({
        receiptId,
        poLineId: input.poLineId,
        itemId: input.itemId,
        receivedQty: String(input.qty),
        locationBinId: input.locationBinId ?? null,
        lotCode: input.lotCode ?? null,
        serialCode: input.serialCode ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    if (!receiptLine) throw new Error("RECEIPT_LINE_INSERT_FAILED");

    // 4) Find/create inventory_lot_serial (match item + lot_code)
    let lotSerialId: string;
    if (input.lotCode || input.serialCode) {
      const lotConds = [eq(inventoryLotSerial.itemId, input.itemId)];
      if (input.lotCode) lotConds.push(eq(inventoryLotSerial.lotCode, input.lotCode));
      if (input.serialCode)
        lotConds.push(eq(inventoryLotSerial.serialCode, input.serialCode));

      const [existingLot] = await tx
        .select({ id: inventoryLotSerial.id })
        .from(inventoryLotSerial)
        .where(and(...lotConds))
        .limit(1);

      if (existingLot) {
        lotSerialId = existingLot.id;
      } else {
        const [newLot] = await tx
          .insert(inventoryLotSerial)
          .values({
            itemId: input.itemId,
            lotCode: input.lotCode ?? null,
            serialCode: input.serialCode ?? null,
            status: "AVAILABLE",
          })
          .returning({ id: inventoryLotSerial.id });
        if (!newLot) throw new Error("LOT_INSERT_FAILED");
        lotSerialId = newLot.id;
      }
    } else {
      // Không có lot code → tạo lot anonymous (1 per receipt line)
      const [anonLot] = await tx
        .insert(inventoryLotSerial)
        .values({
          itemId: input.itemId,
          supplierRef: `RCV-${receiptLine.id.slice(0, 8)}`,
          status: "AVAILABLE",
        })
        .returning({ id: inventoryLotSerial.id });
      if (!anonLot) throw new Error("LOT_INSERT_FAILED");
      lotSerialId = anonLot.id;
    }

    // 5) Insert inventory_txn IN_RECEIPT
    const [txn] = await tx
      .insert(inventoryTxn)
      .values({
        txType: "IN_RECEIPT",
        itemId: input.itemId,
        qty: String(input.qty),
        toBinId: input.locationBinId ?? null,
        lotSerialId,
        refTable: "inbound_receipt_line",
        refId: receiptLine.id,
        postedBy: input.userId,
        notes: input.notes ?? null,
      })
      .returning({ id: inventoryTxn.id });
    if (!txn) throw new Error("INVENTORY_TXN_INSERT_FAILED");

    // 6) UPDATE PO line received_qty
    await tx
      .update(purchaseOrderLine)
      .set({
        receivedQty: sql`${purchaseOrderLine.receivedQty} + ${input.qty}`,
      })
      .where(eq(purchaseOrderLine.id, input.poLineId));

    // 7) UPDATE PO status nếu tất cả line đều đủ (→ RECEIVED) hoặc partial (→ PARTIAL)
    const allLines = await tx
      .select({
        ordered: purchaseOrderLine.orderedQty,
        received: purchaseOrderLine.receivedQty,
      })
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.poId, input.poId));

    const allFull = allLines.every(
      (l) => Number.parseFloat(l.received) >= Number.parseFloat(l.ordered),
    );
    const anyReceived = allLines.some(
      (l) => Number.parseFloat(l.received) > 0,
    );

    if (allFull) {
      await tx
        .update(purchaseOrder)
        .set({ status: "RECEIVED" })
        .where(eq(purchaseOrder.id, input.poId));
    } else if (anyReceived) {
      await tx
        .update(purchaseOrder)
        .set({ status: "PARTIAL" })
        .where(
          and(
            eq(purchaseOrder.id, input.poId),
            eq(purchaseOrder.status, "SENT"),
          ),
        );
    }

    // 8) UPDATE bom_snapshot_line.received_qty nếu có link
    let snapshotLineUpdated = false;
    let newSnapshotState: string | null = null;
    if (poLine.snapshotLineId) {
      const updatedRows = await tx
        .update(bomSnapshotLine)
        .set({
          receivedQty: sql`${bomSnapshotLine.receivedQty} + ${input.qty}`,
          updatedAt: new Date(),
        })
        .where(eq(bomSnapshotLine.id, poLine.snapshotLineId))
        .returning({
          id: bomSnapshotLine.id,
          state: bomSnapshotLine.state,
          versionLock: bomSnapshotLine.versionLock,
        });
      if (updatedRows.length > 0) {
        snapshotLineUpdated = true;
        // Transition PURCHASING → INBOUND_QC (pending QC manual)
        const cur = updatedRows[0];
        if (cur && cur.state === "PURCHASING") {
          const [trans] = await tx
            .update(bomSnapshotLine)
            .set({
              state: "INBOUND_QC",
              versionLock: cur.versionLock + 1,
              transitionedAt: new Date(),
              transitionedBy: input.userId,
              updatedAt: new Date(),
            })
            .where(eq(bomSnapshotLine.id, poLine.snapshotLineId))
            .returning({ state: bomSnapshotLine.state });
          if (trans) newSnapshotState = trans.state;
        } else if (cur) {
          newSnapshotState = cur.state;
        }
      }
    }

    // 9) Link receiving_event về chain (cập nhật metadata)
    await tx
      .update(receivingEvent)
      .set({
        metadata: sql`COALESCE(${receivingEvent.metadata}, '{}'::jsonb) || ${JSON.stringify(
          {
            inventoryTxnId: txn.id,
            receiptLineId: receiptLine.id,
            lotSerialId,
            postedAt: new Date().toISOString(),
          },
        )}::jsonb`,
      })
      .where(eq(receivingEvent.id, input.scanEventId));

    return {
      receiptLineId: receiptLine.id,
      inventoryTxnId: txn.id,
      lotSerialId,
      snapshotLineUpdated,
      newSnapshotState,
    };
  });
}
