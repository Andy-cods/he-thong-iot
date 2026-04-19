import { and, eq, sql, type SQL } from "drizzle-orm";
import {
  bomSnapshotLine,
  inventoryLotSerial,
  inventoryTxn,
  reservation,
  type Reservation,
  type ReservationReason,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * V1.3 Reservation repository.
 *
 * Core: pick lot FIFO/FEFO + atomic advisory lock per item để tránh
 * over-reservation race condition.
 *
 * Policy:
 *   - Lot có exp_date → FEFO (exp_date asc, nulls last)
 *   - Lot không exp_date → FIFO (created_at asc)
 *   - Chỉ pick lot status=AVAILABLE
 *   - Reject lot sắp hết hạn (< 7 ngày)
 *   - on_hand = tổng inventory_txn - tổng reservation ACTIVE của lot đó
 *   - reservation_qty <= on_hand_remaining
 */

export class ReservationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(message);
  }
}

export interface ReserveInput {
  snapshotLineId: string;
  qty: number;
  woId?: string | null;
  userId: string | null;
  manualLotId?: string | null;
}

export interface ReserveResult {
  reservationId: string;
  lotId: string;
  lotCode: string | null;
  serialCode: string | null;
  reservedQty: number;
  reason: ReservationReason;
}

/**
 * Chọn 1 lot theo FIFO/FEFO cho item + tính on_hand còn lại.
 * Assumption: đã call `pg_advisory_xact_lock(item_id)` trước đó.
 */
async function pickLotForItem(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  itemId: string,
  requiredQty: number,
  options: { manualLotId?: string | null } = {},
): Promise<{
  lotId: string;
  lotCode: string | null;
  serialCode: string | null;
  expDate: string | null;
  onHandRemaining: number;
  reason: ReservationReason;
}> {
  // on_hand per lot: sum inv_txn (IN positive, OUT negative) - sum reservation ACTIVE
  // Dùng raw SQL cho 1 query tổng hợp.
  const rawRows = (await tx.execute(sql`
    WITH lot_txn AS (
      SELECT
        l.id AS lot_id,
        l.lot_code,
        l.serial_code,
        l.exp_date,
        l.created_at,
        l.status,
        COALESCE(SUM(
          CASE
            WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
            WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
            ELSE 0
          END
        ), 0) AS on_hand_raw
      FROM app.inventory_lot_serial l
      LEFT JOIN app.inventory_txn t ON t.lot_serial_id = l.id
      WHERE l.item_id = ${itemId}
        AND l.status = 'AVAILABLE'
      GROUP BY l.id
    ),
    lot_reserved AS (
      SELECT r.lot_serial_id AS lot_id, COALESCE(SUM(r.reserved_qty), 0) AS reserved
      FROM app.reservation r
      WHERE r.status = 'ACTIVE'
      GROUP BY r.lot_serial_id
    )
    SELECT
      lt.lot_id,
      lt.lot_code,
      lt.serial_code,
      lt.exp_date,
      lt.created_at,
      (lt.on_hand_raw - COALESCE(lr.reserved, 0))::numeric AS on_hand_remaining
    FROM lot_txn lt
    LEFT JOIN lot_reserved lr ON lr.lot_id = lt.lot_id
    WHERE (lt.on_hand_raw - COALESCE(lr.reserved, 0)) > 0
      AND (lt.exp_date IS NULL OR lt.exp_date > (now() + interval '7 days')::date)
    ORDER BY
      CASE WHEN lt.exp_date IS NOT NULL THEN 0 ELSE 1 END,
      lt.exp_date ASC NULLS LAST,
      lt.created_at ASC
  `)) as unknown as Array<{
    lot_id: string;
    lot_code: string | null;
    serial_code: string | null;
    exp_date: string | null;
    created_at: string;
    on_hand_remaining: string;
  }>;

  if (rawRows.length === 0) {
    throw new ReservationError(
      "Không có lot AVAILABLE đủ qty hoặc tất cả lot sắp hết hạn (< 7 ngày).",
      "NO_AVAILABLE_LOT",
      409,
    );
  }

  // Nếu manual: tìm đúng lot_id đó trong list
  if (options.manualLotId) {
    const manual = rawRows.find((r) => r.lot_id === options.manualLotId);
    if (!manual) {
      throw new ReservationError(
        "Lot chỉ định không AVAILABLE hoặc không đủ qty.",
        "MANUAL_LOT_NOT_ELIGIBLE",
        409,
      );
    }
    const onHand = Number(manual.on_hand_remaining);
    if (onHand < requiredQty) {
      throw new ReservationError(
        `Lot chỉ định chỉ còn ${onHand}, cần ${requiredQty}.`,
        "INSUFFICIENT_STOCK",
        409,
      );
    }
    return {
      lotId: manual.lot_id,
      lotCode: manual.lot_code,
      serialCode: manual.serial_code,
      expDate: manual.exp_date,
      onHandRemaining: onHand,
      reason: "MANUAL",
    };
  }

  // Auto: pick lot đầu tiên có đủ qty
  for (const r of rawRows) {
    const onHand = Number(r.on_hand_remaining);
    if (onHand >= requiredQty) {
      const reason: ReservationReason = r.exp_date ? "AUTO_FEFO" : "AUTO_FIFO";
      return {
        lotId: r.lot_id,
        lotCode: r.lot_code,
        serialCode: r.serial_code,
        expDate: r.exp_date,
        onHandRemaining: onHand,
        reason,
      };
    }
  }

  // Tổng on_hand có thể đủ nhưng không có lot đơn lẻ đủ — V1.3 không split
  const totalOnHand = rawRows.reduce(
    (acc, r) => acc + Number(r.on_hand_remaining),
    0,
  );
  throw new ReservationError(
    `Không lot nào đủ ${requiredQty}. Tổng on_hand: ${totalOnHand}. V1.3 chưa hỗ trợ split multi-lot.`,
    "INSUFFICIENT_STOCK",
    409,
  );
}

/**
 * Reserve 1 snapshot_line với FIFO/FEFO auto.
 *
 * Flow atomic trong transaction:
 *   1) Lock item (advisory xact lock) → serialize concurrent reserve cùng item.
 *   2) Load snapshot_line, verify state AVAILABLE (hoặc có reserved dư).
 *   3) Pick lot FIFO/FEFO.
 *   4) INSERT reservation ACTIVE.
 *   5) UPDATE snapshot_line.reserved_qty += qty.
 *   6) INSERT inventory_txn kind=RESERVE (qty positive, ref_table='reservation').
 *   7) Nếu reserved_qty >= required → transition AVAILABLE → RESERVED.
 */
export async function reserveSnapshotLine(
  input: ReserveInput,
): Promise<ReserveResult> {
  if (input.qty <= 0) {
    throw new ReservationError("Qty phải > 0", "INVALID_QTY", 400);
  }

  return db.transaction(async (tx) => {
    // 1) Load snapshot_line
    const [snap] = await tx
      .select()
      .from(bomSnapshotLine)
      .where(eq(bomSnapshotLine.id, input.snapshotLineId))
      .limit(1);
    if (!snap) {
      throw new ReservationError(
        "Snapshot line không tồn tại.",
        "SNAPSHOT_LINE_NOT_FOUND",
        404,
      );
    }

    // 2) Lock per item — serialize concurrent reserve cùng item để tránh race
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(
      sql`SELECT app.reservation_lock(${snap.componentItemId}::uuid)`,
    );

    // 3) Guard state: chỉ reserve khi AVAILABLE (chỉ cho partial reserve nếu cần)
    if (snap.state !== "AVAILABLE" && snap.state !== "RESERVED") {
      throw new ReservationError(
        `Snapshot line đang ở state ${snap.state}, chỉ reserve được khi AVAILABLE.`,
        "INVALID_STATE",
        422,
      );
    }

    const reserved = Number(snap.reservedQty);
    const required = Number(snap.grossRequiredQty);
    const qcPass = Number(snap.qcPassQty);
    const remainingNeeded = Math.max(0, required - reserved);
    if (remainingNeeded === 0) {
      throw new ReservationError(
        "Snapshot line đã reserve đủ.",
        "ALREADY_FULLY_RESERVED",
        409,
      );
    }
    if (input.qty > remainingNeeded) {
      throw new ReservationError(
        `Qty yêu cầu (${input.qty}) vượt quá số còn thiếu (${remainingNeeded}).`,
        "QTY_EXCEEDS_REMAINING",
        422,
      );
    }
    if (qcPass < reserved + input.qty) {
      throw new ReservationError(
        `QC pass (${qcPass}) không đủ cover reserved (${reserved}) + yêu cầu (${input.qty}).`,
        "INSUFFICIENT_QC_PASS",
        409,
      );
    }

    // 4) Pick lot FIFO/FEFO
    const picked = await pickLotForItem(
      tx,
      snap.componentItemId,
      input.qty,
      { manualLotId: input.manualLotId ?? null },
    );

    // 5) Insert reservation
    const [resv] = await tx
      .insert(reservation)
      .values({
        snapshotLineId: input.snapshotLineId,
        lotSerialId: picked.lotId,
        woId: input.woId ?? null,
        reservedQty: String(input.qty),
        status: "ACTIVE",
        reservationReason: picked.reason,
        reservedBy: input.userId,
      })
      .returning();
    if (!resv) throw new Error("RESERVATION_INSERT_FAILED");

    // 6) Update snapshot_line.reserved_qty
    const newReserved = reserved + input.qty;
    await tx
      .update(bomSnapshotLine)
      .set({
        reservedQty: String(newReserved),
        state: newReserved >= required ? "RESERVED" : snap.state,
        transitionedAt:
          newReserved >= required && snap.state === "AVAILABLE"
            ? new Date()
            : snap.transitionedAt,
        transitionedBy:
          newReserved >= required && snap.state === "AVAILABLE"
            ? input.userId
            : snap.transitionedBy,
        versionLock: sql`${bomSnapshotLine.versionLock} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(bomSnapshotLine.id, input.snapshotLineId));

    // 7) Inventory txn RESERVE (qty positive — ref_table='reservation')
    await tx.insert(inventoryTxn).values({
      txType: "RESERVE",
      itemId: snap.componentItemId,
      lotSerialId: picked.lotId,
      qty: String(input.qty),
      refTable: "reservation",
      refId: resv.id,
      postedBy: input.userId,
      notes: `Reserved cho snapshot_line ${input.snapshotLineId} (${picked.reason})`,
    });

    logger.info(
      {
        reservationId: resv.id,
        snapshotLineId: input.snapshotLineId,
        lotId: picked.lotId,
        qty: input.qty,
        reason: picked.reason,
      },
      "reservation created",
    );

    return {
      reservationId: resv.id,
      lotId: picked.lotId,
      lotCode: picked.lotCode,
      serialCode: picked.serialCode,
      reservedQty: input.qty,
      reason: picked.reason,
    };
  });
}

/**
 * Release reservation ACTIVE → RELEASED. Rollback snapshot_line.reserved_qty,
 * insert inv_txn UNRESERVE.
 */
export async function releaseReservation(
  reservationId: string,
  userId: string | null,
  reason?: string | null,
): Promise<Reservation> {
  return db.transaction(async (tx) => {
    const [resv] = await tx
      .select()
      .from(reservation)
      .where(eq(reservation.id, reservationId))
      .limit(1);
    if (!resv) {
      throw new ReservationError(
        "Reservation không tồn tại.",
        "RESERVATION_NOT_FOUND",
        404,
      );
    }
    if (resv.status !== "ACTIVE") {
      throw new ReservationError(
        `Reservation đã ${resv.status}, không release được.`,
        "INVALID_STATUS",
        409,
      );
    }

    // Lock item trước khi modify (tránh race với reserve khác)
    const [snap] = await tx
      .select({
        id: bomSnapshotLine.id,
        componentItemId: bomSnapshotLine.componentItemId,
        reservedQty: bomSnapshotLine.reservedQty,
        grossRequiredQty: bomSnapshotLine.grossRequiredQty,
        state: bomSnapshotLine.state,
      })
      .from(bomSnapshotLine)
      .where(eq(bomSnapshotLine.id, resv.snapshotLineId))
      .limit(1);
    if (!snap) throw new Error("SNAPSHOT_LINE_NOT_FOUND");

    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(
      sql`SELECT app.reservation_lock(${snap.componentItemId}::uuid)`,
    );

    // Update reservation → RELEASED
    const [updated] = await tx
      .update(reservation)
      .set({
        status: "RELEASED",
        releasedAt: new Date(),
        releasedBy: userId,
        releaseReason: reason ?? null,
        versionLock: sql`${reservation.versionLock} + 1`,
      })
      .where(
        and(eq(reservation.id, reservationId), eq(reservation.status, "ACTIVE")),
      )
      .returning();
    if (!updated) {
      throw new ReservationError(
        "Release fail (đã bị release bởi txn khác).",
        "RACE_CONDITION",
        409,
      );
    }

    // Rollback snapshot_line.reserved_qty
    const rollbackQty = Number(resv.reservedQty);
    const newReserved = Math.max(0, Number(snap.reservedQty) - rollbackQty);
    const newState =
      snap.state === "RESERVED" &&
      newReserved < Number(snap.grossRequiredQty)
        ? "AVAILABLE"
        : snap.state;
    await tx
      .update(bomSnapshotLine)
      .set({
        reservedQty: String(newReserved),
        state: newState,
        versionLock: sql`${bomSnapshotLine.versionLock} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(bomSnapshotLine.id, snap.id));

    // Insert UNRESERVE inv_txn
    await tx.insert(inventoryTxn).values({
      txType: "UNRESERVE",
      itemId: snap.componentItemId,
      lotSerialId: resv.lotSerialId,
      qty: String(rollbackQty),
      refTable: "reservation",
      refId: reservationId,
      postedBy: userId,
      notes: reason ?? "Released",
    });

    logger.info(
      { reservationId, snapshotLineId: snap.id, qty: rollbackQty },
      "reservation released",
    );

    return updated;
  });
}

export interface BulkReserveResult {
  successCount: number;
  failures: Array<{ snapshotLineId: string; error: string; code: string }>;
  reservations: ReserveResult[];
}

/**
 * Bulk reserve N snapshot_lines — loop reserve từng cái, advisory lock per item.
 * Nếu có lines fail, các lines thành công vẫn giữ (partial success).
 */
export async function bulkReserveOrder(
  snapshotLineIds: string[],
  userId: string | null,
  woId?: string | null,
): Promise<BulkReserveResult> {
  const reservations: ReserveResult[] = [];
  const failures: BulkReserveResult["failures"] = [];

  for (const lineId of snapshotLineIds) {
    try {
      // Reserve đủ remaining cho mỗi line
      const [snap] = await db
        .select({
          reservedQty: bomSnapshotLine.reservedQty,
          grossRequiredQty: bomSnapshotLine.grossRequiredQty,
        })
        .from(bomSnapshotLine)
        .where(eq(bomSnapshotLine.id, lineId))
        .limit(1);
      if (!snap) {
        failures.push({
          snapshotLineId: lineId,
          code: "SNAPSHOT_LINE_NOT_FOUND",
          error: "Không tìm thấy snapshot line",
        });
        continue;
      }
      const remaining =
        Number(snap.grossRequiredQty) - Number(snap.reservedQty);
      if (remaining <= 0) continue;

      const r = await reserveSnapshotLine({
        snapshotLineId: lineId,
        qty: remaining,
        woId: woId ?? null,
        userId,
      });
      reservations.push(r);
    } catch (err) {
      const e = err as Error & { code?: string };
      failures.push({
        snapshotLineId: lineId,
        code: e.code ?? "UNKNOWN",
        error: e.message,
      });
    }
  }

  return {
    successCount: reservations.length,
    failures,
    reservations,
  };
}

export async function listReservations(
  filter: { snapshotLineId?: string; lotId?: string; woId?: string; status?: string },
): Promise<Reservation[]> {
  const where: SQL[] = [];
  if (filter.snapshotLineId)
    where.push(eq(reservation.snapshotLineId, filter.snapshotLineId));
  if (filter.lotId) where.push(eq(reservation.lotSerialId, filter.lotId));
  if (filter.woId) where.push(eq(reservation.woId, filter.woId));
  if (filter.status)
    where.push(
      eq(
        reservation.status,
        filter.status as unknown as (typeof reservation.status.enumValues)[number],
      ),
    );
  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  return db
    .select()
    .from(reservation)
    .where(whereExpr)
    .orderBy(sql`${reservation.reservedAt} DESC`)
    .limit(500);
}

