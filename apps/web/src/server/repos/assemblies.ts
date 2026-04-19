import { and, eq, sql } from "drizzle-orm";
import {
  assemblyScan,
  bomSnapshotLine,
  inventoryLotSerial,
  inventoryTxn,
  reservation,
  workOrderLine,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * V1.3 Assembly scan repository.
 *
 * `recordAssemblyScanAtomic` — 5-table atomic chain:
 *   1) assembly_scan INSERT (idempotent qua offline_queue_id UNIQUE)
 *   2) inventory_txn INSERT kind=ASSEMBLY_CONSUME (negative)
 *   3) inventory_lot_serial status update → CONSUMED nếu on_hand = 0
 *   4) reservation status update → CONSUMED (hoặc reduce reserved_qty)
 *   5) bom_snapshot_line issued_qty += qty; assembled_qty += qty;
 *      state transition RESERVED → ISSUED → ASSEMBLED nếu đủ qty
 *   (bonus) work_order_line.completed_qty += qty
 */

export class AssemblyScanError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(message);
  }
}

export interface AssemblyScanInput {
  woId: string;
  snapshotLineId: string;
  lotSerialId: string;
  reservationId?: string | null;
  qty: number;
  offlineQueueId: string;
  barcode: string;
  itemId?: string | null;
  fromBinId?: string | null;
  deviceId?: string | null;
  scannedAt: Date;
  userId: string | null;
}

export interface AssemblyScanResult {
  scanId: string;
  idempotent: boolean; // true nếu đã có record với offlineQueueId
  snapshotLineState: string;
  lotStatus: string;
  consumedQty: number;
}

/**
 * Atomic 5-table consume. Idempotent qua offline_queue_id.
 */
export async function recordAssemblyScanAtomic(
  input: AssemblyScanInput,
): Promise<AssemblyScanResult> {
  if (input.qty <= 0) {
    throw new AssemblyScanError("Qty phải > 0", "INVALID_QTY", 400);
  }

  return db.transaction(async (tx) => {
    // 1) Idempotency check
    const [existing] = await tx
      .select()
      .from(assemblyScan)
      .where(eq(assemblyScan.offlineQueueId, input.offlineQueueId))
      .limit(1);
    if (existing) {
      const [lot] = await tx
        .select({ status: inventoryLotSerial.status })
        .from(inventoryLotSerial)
        .where(eq(inventoryLotSerial.id, input.lotSerialId))
        .limit(1);
      const [snap] = await tx
        .select({ state: bomSnapshotLine.state })
        .from(bomSnapshotLine)
        .where(eq(bomSnapshotLine.id, input.snapshotLineId))
        .limit(1);
      return {
        scanId: existing.id,
        idempotent: true,
        snapshotLineState: snap?.state ?? "UNKNOWN",
        lotStatus: lot?.status ?? "UNKNOWN",
        consumedQty: Number(existing.qty),
      };
    }

    // 2) Load & verify snapshot + lot + reservation
    const [snap] = await tx
      .select()
      .from(bomSnapshotLine)
      .where(eq(bomSnapshotLine.id, input.snapshotLineId))
      .limit(1);
    if (!snap) {
      throw new AssemblyScanError(
        "Snapshot line không tồn tại",
        "SNAPSHOT_LINE_NOT_FOUND",
        404,
      );
    }

    // Lock per item để serialize concurrent scan cùng item
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(
      sql`SELECT app.reservation_lock(${snap.componentItemId}::uuid)`,
    );

    // Verify reservation (nếu có) đang ACTIVE cho lot này
    if (input.reservationId) {
      const [resv] = await tx
        .select()
        .from(reservation)
        .where(eq(reservation.id, input.reservationId))
        .limit(1);
      if (!resv || resv.status !== "ACTIVE") {
        throw new AssemblyScanError(
          "Reservation không ACTIVE",
          "INVALID_RESERVATION",
          409,
        );
      }
      if (resv.lotSerialId !== input.lotSerialId) {
        throw new AssemblyScanError(
          "Lot scan không khớp reservation",
          "LOT_MISMATCH",
          409,
        );
      }
      if (Number(resv.reservedQty) < input.qty) {
        throw new AssemblyScanError(
          `Reserved ${resv.reservedQty} < requested ${input.qty}`,
          "INSUFFICIENT_RESERVED",
          409,
        );
      }
    }

    // 3) Insert assembly_scan
    // NOTE: assemblyScan.aoId NOT NULL — V1.3 decision 1:1 WO:AO chưa enforced;
    // vì scope cook này chỉ include WO + reservation, tạm dùng woId as aoId
    // placeholder NÊN CẦN AO có sẵn. Trong thực tế, B3 sẽ tạo AO trước khi scan.
    // Ở đây ta bỏ qua nếu ao_id vắng → throw rõ.
    // CHÚ Ý: Phase B2 chưa require assembly scan, nên function này là skeleton
    // sẵn sàng cho B3. Hiện tại để AO_ID NOT NULL ta cần AO tồn tại.
    // Giải pháp: trong V1.3 cook này chỉ làm repo skeleton, B3 sẽ cook UI/API.

    // Stub: yêu cầu caller truyền aoId — nhưng AssemblyScanInput không có.
    // → Giải pháp: caller hiện tại (chưa có B3) không gọi function này;
    //   function này expose sẵn cho B3 sau.
    throw new AssemblyScanError(
      "recordAssemblyScanAtomic chưa có assembly_order context (B3 scope)",
      "NOT_IMPLEMENTED_AT_B2",
      501,
    );
    // eslint-disable-next-line no-unreachable
    void tx;
    void input;
    void inventoryTxn;
    void workOrderLine;
    void logger;
  });
}

/**
 * Helper: compute on_hand qty for 1 lot (từ inv_txn + reservation ACTIVE).
 * Dùng cho timeline lot detail.
 */
export async function getLotOnHandRemaining(lotId: string): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
          WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
          ELSE 0
        END
      ), 0) -
      COALESCE((SELECT SUM(reserved_qty) FROM app.reservation WHERE lot_serial_id = ${lotId} AND status='ACTIVE'), 0)
      AS on_hand
    FROM app.inventory_txn t
    WHERE t.lot_serial_id = ${lotId}
  `)) as unknown as Array<{ on_hand: string | number }>;
  return Number(rows[0]?.on_hand ?? 0);
}
