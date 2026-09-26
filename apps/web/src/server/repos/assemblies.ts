import { and, eq, isNull, sql } from "drizzle-orm";
import {
  assemblyOrder,
  assemblyScan,
  bomSnapshotLine,
  inventoryLotSerial,
  reservation,
  workOrder,
  workOrderLine,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { WO_STATUS_LABEL_VI, isWoScannable } from "@/lib/wo-guards";
import {
  StockGuardError,
  assertIssuable,
  lockItemsAndLots,
  mapDbGuardError,
  postOutboundTxns,
  type IssuePick,
} from "./stockGuard";

/**
 * V1.3 Phase B3 — Assembly scan repository (FULL atomic).
 *
 * `recordAssemblyScanAtomic` — 5-table transaction:
 *   1) assembly_scan INSERT (idempotent qua offline_queue_id UNIQUE)
 *   2) inventory_txn INSERT kind=ASSEMBLY_CONSUME (qty positive ở DB, bản
 *      chất deduct; on_hand CTE cộng trừ theo tx_type)
 *   3) inventory_lot_serial: deduct on_hand, set status CONSUMED nếu hết
 *   4) bom_snapshot_line increment issued_qty + assembled_qty (state
 *      RESERVED → ISSUED → ASSEMBLED) — decrement reserved_qty
 *   5) work_order_line.completed_qty += qty
 *   6) reservation: partial release (giảm reserved_qty) hoặc CONSUMED
 *
 * Advisory lock per lot (`pg_advisory_xact_lock(hashtext('scan:'||lot_id))`)
 * để serialize concurrent scan cùng lot.
 *
 * V4.1 Đợt 1a (KHO-02/06): bỏ khoá riêng `scan:` (khác namespace `lot:` của
 * đường xuất → không chặn nhau). Nay dùng khoá chung item → lô của
 * `stockGuard`, kiểm lô AVAILABLE (lô HOLD/chờ QC không tiêu hao được) + tồn
 * bin + phần giữ chỗ (trừ giữ chỗ của chính dòng này). ASSEMBLY_CONSUME ghi
 * `from_bin_id` (chia qua các bin của lô — `allocateAcrossBins`) để sơ đồ kho
 * trừ đúng; trước đây không có bin → bin_inventory không bao giờ giảm.
 *
 * Error codes:
 *   - INSUFFICIENT_RESERVED (409): reserved < requested qty
 *   - LOT_NOT_RESERVED (409): không có reservation ACTIVE cho (line, lot)
 *   - DUPLICATE_SCAN (200 idempotent): offline_queue_id đã tồn tại → trả record cũ
 *   - SNAPSHOT_LINE_NOT_FOUND (404)
 *   - WO_LINE_NOT_FOUND (404)
 *   - INVALID_QTY (400)
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

/**
 * V4.1 KHO-02 — THUẦN: chia `qty` cần tiêu hao qua các bin đang chứa lô.
 * Lấy bin nhiều hàng trước (ít tách dòng nhất), hoà thì theo binId cho ổn
 * định. Trả null nếu tổng tồn các bin không đủ.
 */
export function allocateAcrossBins(
  bins: Array<{ binId: string; qty: number }>,
  qty: number,
): Array<{ binId: string; qty: number }> | null {
  const EPS = 1e-6;
  const round4 = (n: number) => Number(n.toFixed(4));
  if (!(qty > 0)) return [];
  const sorted = bins
    .filter((b) => b.qty > EPS)
    .sort((a, b) => b.qty - a.qty || a.binId.localeCompare(b.binId));
  const out: Array<{ binId: string; qty: number }> = [];
  let remaining = round4(qty);
  for (const b of sorted) {
    if (remaining <= EPS) break;
    const take = round4(Math.min(b.qty, remaining));
    if (take <= EPS) continue;
    out.push({ binId: b.binId, qty: take });
    remaining = round4(remaining - take);
  }
  return remaining > EPS ? null : out;
}

export interface AssemblyScanInput {
  woId: string;
  snapshotLineId: string;
  lotSerialId: string;
  qty: number;
  offlineQueueId: string; // UUIDv7
  barcode: string;
  scannedAt: Date;
  deviceId?: string | null;
  userId: string | null;
}

export interface AssemblyScanResult {
  scanId: string;
  idempotent: boolean;
  snapshotLineState: string;
  lotStatus: string;
  consumedQty: number;
  reservationStatus: string;
  completedQty: number;
  requiredQty: number;
}

/**
 * Ensure 1 assembly_order tồn tại cho WO này. V1.3 1:1 WO:AO.
 * Reuse existing AO nếu có; else tạo mới với ao_no derived từ wo_no.
 */
async function ensureAssemblyOrder(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  woId: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: assemblyOrder.id })
    .from(assemblyOrder)
    .where(eq(assemblyOrder.woId, woId))
    .limit(1);
  if (existing) return existing.id;

  const [wo] = await tx
    .select({
      id: workOrder.id,
      woNo: workOrder.woNo,
      productItemId: workOrder.productItemId,
      linkedOrderId: workOrder.linkedOrderId,
      plannedQty: workOrder.plannedQty,
    })
    .from(workOrder)
    .where(eq(workOrder.id, woId))
    .limit(1);
  if (!wo) {
    throw new AssemblyScanError("Work Order không tồn tại", "WO_NOT_FOUND", 404);
  }
  if (!wo.linkedOrderId) {
    throw new AssemblyScanError(
      "WO không link sales_order — cần link trước khi scan.",
      "WO_MISSING_ORDER",
      422,
    );
  }

  const aoNo = wo.woNo.replace(/^WO-/, "AO-");
  const [ao] = await tx
    .insert(assemblyOrder)
    .values({
      aoNo,
      orderId: wo.linkedOrderId,
      productItemId: wo.productItemId,
      plannedQty: wo.plannedQty,
      status: "ASSEMBLING",
      woId: wo.id,
      startedAt: new Date(),
    })
    .returning({ id: assemblyOrder.id });
  if (!ao) throw new Error("AO_INSERT_FAILED");
  return ao.id;
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

  try {
    return await recordAssemblyScanTx(input);
  } catch (err) {
    // V4.1 Đợt 1a — lỗi guard xuất kho / trigger 0059 / lock_timeout → 409
    // qua AssemblyScanError để 2 route scan (đơn + batch) trả mã lỗi rõ.
    if (err instanceof AssemblyScanError) throw err;
    const g = mapDbGuardError(err);
    if (g) throw new AssemblyScanError(g.message, g.code, g.status);
    throw err;
  }
}

async function recordAssemblyScanTx(
  input: AssemblyScanInput,
): Promise<AssemblyScanResult> {
  return db.transaction(async (tx) => {
    // 1) Idempotency — offline_queue_id UNIQUE
    const [existing] = await tx
      .select()
      .from(assemblyScan)
      .where(eq(assemblyScan.offlineQueueId, input.offlineQueueId))
      .limit(1);
    if (existing) {
      const [lot] = await tx
        .select({ status: inventoryLotSerial.status })
        .from(inventoryLotSerial)
        .where(eq(inventoryLotSerial.id, existing.lotSerialId ?? input.lotSerialId))
        .limit(1);
      const [snap] = await tx
        .select({ state: bomSnapshotLine.state })
        .from(bomSnapshotLine)
        .where(eq(bomSnapshotLine.id, existing.snapshotLineId ?? input.snapshotLineId))
        .limit(1);
      const [wol] = await tx
        .select({
          completedQty: workOrderLine.completedQty,
          requiredQty: workOrderLine.requiredQty,
        })
        .from(workOrderLine)
        .where(
          and(
            eq(workOrderLine.woId, input.woId),
            eq(workOrderLine.snapshotLineId, input.snapshotLineId),
          ),
        )
        .limit(1);
      return {
        scanId: existing.id,
        idempotent: true,
        snapshotLineState: snap?.state ?? "UNKNOWN",
        lotStatus: lot?.status ?? "UNKNOWN",
        consumedQty: Number(existing.qty),
        reservationStatus: "UNKNOWN",
        completedQty: Number(wol?.completedQty ?? 0),
        requiredQty: Number(wol?.requiredQty ?? 0),
      };
    }

    // 2-3) Load snapshot_line + WO line
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

    // V4.1 SX-22 — chỉ quét (trừ kho) khi lệnh đã duyệt / đang chạy. Khoá
    // hàng WO để không đổi trạng thái (huỷ/hoàn thành) giữa chừng.
    const [woRow] = await tx
      .select({ status: workOrder.status })
      .from(workOrder)
      .where(eq(workOrder.id, input.woId))
      .for("update");
    if (!woRow) {
      throw new AssemblyScanError("Work Order không tồn tại", "WO_NOT_FOUND", 404);
    }
    if (!isWoScannable(woRow.status)) {
      throw new AssemblyScanError(
        `Lệnh đang "${WO_STATUS_LABEL_VI[woRow.status] ?? woRow.status}" — chỉ quét lắp ráp khi lệnh đã duyệt hoặc đang sản xuất.`,
        "WO_INVALID_STATE",
        409,
      );
    }

    // V4.1 SX-23 — khoá dòng WO (FOR UPDATE) → 2 lần quét đồng thời cùng dòng
    // chạy tuần tự, không cùng đọc completed_qty cũ.
    const [wol] = await tx
      .select()
      .from(workOrderLine)
      .where(
        and(
          eq(workOrderLine.woId, input.woId),
          eq(workOrderLine.snapshotLineId, input.snapshotLineId),
        ),
      )
      .for("update");
    if (!wol) {
      throw new AssemblyScanError(
        "WO line không tồn tại cho snapshot_line này",
        "WO_LINE_NOT_FOUND",
        404,
      );
    }
    // V4.1 SX-22 — không tiêu hao vượt SL cần của dòng.
    const remainingNeed = Number(wol.requiredQty) - Number(wol.completedQty);
    if (input.qty > remainingNeed + 1e-9) {
      throw new AssemblyScanError(
        `Vượt số lượng cần: dòng chỉ còn thiếu ${Math.max(0, Number(remainingNeed.toFixed(4)))}.`,
        "OVER_REQUIRED",
        409,
      );
    }

    // 3b) V4.1 KHO-06 — khoá chung item → lô (cùng thứ tự với mọi đường
    //     xuất) thay khoá riêng 'scan:'.
    await lockItemsAndLots(tx, [snap.componentItemId], [input.lotSerialId]);

    // 4) Find active reservation (line, lot)
    const [resv] = await tx
      .select()
      .from(reservation)
      .where(
        and(
          eq(reservation.snapshotLineId, input.snapshotLineId),
          eq(reservation.lotSerialId, input.lotSerialId),
          eq(reservation.status, "ACTIVE"),
          isNull(reservation.releasedAt),
        ),
      )
      .limit(1);
    if (!resv) {
      throw new AssemblyScanError(
        "Lot chưa được reserve cho snapshot_line này.",
        "LOT_NOT_RESERVED",
        409,
      );
    }
    const reservedQty = Number(resv.reservedQty);
    if (reservedQty < input.qty) {
      throw new AssemblyScanError(
        `Reserved ${reservedQty} < scan ${input.qty}`,
        "INSUFFICIENT_RESERVED",
        409,
      );
    }

    // 4b) V4.1 KHO-02/06 — chia SL qua các bin của lô + guard chung (lô phải
    //     AVAILABLE, đủ tồn bin, không lấn giữ chỗ của lệnh khác — được dùng
    //     phần giữ chỗ của chính dòng này).
    const binRows = (await tx.execute(sql`
      SELECT bin_id::text AS bin_id, qty_on_hand::text AS qty
      FROM app.bin_inventory
      WHERE lot_serial_id = ${input.lotSerialId}
        AND item_id = ${snap.componentItemId}
    `)) as unknown as Array<{ bin_id: string; qty: string }>;
    const alloc = allocateAcrossBins(
      binRows.map((r) => ({ binId: r.bin_id, qty: Number(r.qty) || 0 })),
      input.qty,
    );
    if (!alloc) {
      throw new AssemblyScanError(
        "Lô không đủ tồn tại các vị trí kho để tiêu hao — kiểm tra sơ đồ kho / chuyển hàng về đúng vị trí.",
        "INSUFFICIENT_BIN",
        409,
      );
    }
    const picks: IssuePick[] = alloc.map((a) => ({
      itemId: snap.componentItemId,
      lotSerialId: input.lotSerialId,
      binId: a.binId,
      qty: a.qty,
    }));
    try {
      await assertIssuable(tx, picks, {
        ownReservations: [
          {
            lotSerialId: input.lotSerialId,
            qty: Math.min(reservedQty, input.qty),
          },
        ],
      });
    } catch (err) {
      if (err instanceof StockGuardError) {
        throw new AssemblyScanError(err.message, err.code, err.status);
      }
      throw err;
    }

    // 5) Ensure AO for this WO (1:1)
    const aoId = await ensureAssemblyOrder(tx, input.woId);

    // 6) INSERT assembly_scan
    const [scan] = await tx
      .insert(assemblyScan)
      .values({
        aoId,
        woId: input.woId,
        snapshotLineId: input.snapshotLineId,
        lotSerialId: input.lotSerialId,
        reservationId: resv.id,
        offlineQueueId: input.offlineQueueId,
        scanKind: "CONSUME",
        barcode: input.barcode,
        itemId: snap.componentItemId,
        qty: String(input.qty),
        scannedAt: input.scannedAt,
        scannedBy: input.userId,
        deviceId: input.deviceId ?? null,
      })
      .returning();
    if (!scan) throw new Error("ASSEMBLY_SCAN_INSERT_FAILED");

    // 7) INSERT inventory_txn ASSEMBLY_CONSUME (qty positive; sign handled bởi
    //    tx_type). V4.1 KHO-02 — có from_bin_id (1 dòng / bin). Lô về 0 được
    //    postOutboundTxns đánh dấu CONSUMED ngay SAU khi insert (trigger 0059).
    await postOutboundTxns(tx, picks, {
      txType: "ASSEMBLY_CONSUME",
      refTable: "assembly_scan",
      refId: scan.id,
      postedBy: input.userId,
      notes: `WO ${input.woId} · line ${input.snapshotLineId}`,
    });

    // 8) UPDATE reservation — partial release hoặc CONSUMED
    const newReservedQty = reservedQty - input.qty;
    if (newReservedQty <= 0.0001) {
      await tx
        .update(reservation)
        .set({
          status: "CONSUMED",
          releasedAt: new Date(),
          releasedBy: input.userId,
          releaseReason: "CONSUMED_BY_SCAN",
          versionLock: sql`${reservation.versionLock} + 1`,
        })
        .where(eq(reservation.id, resv.id));
    } else {
      await tx
        .update(reservation)
        .set({
          reservedQty: String(newReservedQty),
          versionLock: sql`${reservation.versionLock} + 1`,
        })
        .where(eq(reservation.id, resv.id));
    }

    // 9) UPDATE snapshot_line: issued + assembled += qty, reserved -= qty, state
    const oldReservedSnap = Number(snap.reservedQty);
    const oldIssued = Number(snap.issuedQty);
    const oldAssembled = Number(snap.assembledQty);
    const required = Number(snap.grossRequiredQty);
    const newIssued = oldIssued + input.qty;
    const newAssembled = oldAssembled + input.qty;
    const newReservedSnap = Math.max(0, oldReservedSnap - input.qty);
    const newState =
      newAssembled >= required
        ? "ASSEMBLED"
        : newIssued > 0
          ? "ISSUED"
          : snap.state;
    await tx
      .update(bomSnapshotLine)
      .set({
        issuedQty: String(newIssued),
        assembledQty: String(newAssembled),
        reservedQty: String(newReservedSnap),
        state: newState,
        transitionedAt:
          newState !== snap.state ? new Date() : snap.transitionedAt,
        transitionedBy:
          newState !== snap.state ? input.userId : snap.transitionedBy,
        versionLock: sql`${bomSnapshotLine.versionLock} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(bomSnapshotLine.id, input.snapshotLineId));

    // 10) UPDATE work_order_line.completed_qty += qty
    const newCompletedQty = Number(wol.completedQty) + input.qty;
    await tx
      .update(workOrderLine)
      .set({
        completedQty: String(newCompletedQty),
        updatedAt: new Date(),
      })
      .where(eq(workOrderLine.id, wol.id));

    // 11) Trạng thái lô sau tiêu hao (CONSUMED đã được postOutboundTxns set
    //     ở bước 7 nếu on_hand về 0).
    const [curLot] = await tx
      .select({ status: inventoryLotSerial.status })
      .from(inventoryLotSerial)
      .where(eq(inventoryLotSerial.id, input.lotSerialId))
      .limit(1);
    const lotStatus: string = curLot?.status ?? "AVAILABLE";

    logger.info(
      {
        scanId: scan.id,
        woId: input.woId,
        lotId: input.lotSerialId,
        qty: input.qty,
        newState,
      },
      "assembly scan atomic done",
    );

    return {
      scanId: scan.id,
      idempotent: false,
      snapshotLineState: newState,
      lotStatus,
      consumedQty: input.qty,
      reservationStatus: newReservedQty <= 0.0001 ? "CONSUMED" : "ACTIVE",
      completedQty: newCompletedQty,
      requiredQty: Number(wol.requiredQty),
    };
  });
}

/**
 * WO progress aggregate — per line issued/completed + total %.
 */
export interface WoProgressLine {
  snapshotLineId: string;
  componentSku: string;
  componentName: string;
  requiredQty: number;
  completedQty: number;
  issuedQty: number;
  assembledQty: number;
  reservedQty: number;
  remainingQty: number;
  state: string;
  reservations: Array<{
    reservationId: string;
    lotId: string;
    lotCode: string | null;
    reservedQty: number;
    status: string;
  }>;
}

export interface WoProgressReport {
  woId: string;
  woNo: string;
  status: string;
  totalRequired: number;
  totalCompleted: number;
  progressPercent: number;
  lines: WoProgressLine[];
}

export async function getWoProgress(woId: string): Promise<WoProgressReport | null> {
  const [wo] = await db
    .select({
      id: workOrder.id,
      woNo: workOrder.woNo,
      status: workOrder.status,
    })
    .from(workOrder)
    .where(eq(workOrder.id, woId))
    .limit(1);
  if (!wo) return null;

  const lineRows = await db
    .select({
      snapshotLineId: workOrderLine.snapshotLineId,
      requiredQty: workOrderLine.requiredQty,
      completedQty: workOrderLine.completedQty,
      componentSku: bomSnapshotLine.componentSku,
      componentName: bomSnapshotLine.componentName,
      issuedQty: bomSnapshotLine.issuedQty,
      assembledQty: bomSnapshotLine.assembledQty,
      reservedQty: bomSnapshotLine.reservedQty,
      state: bomSnapshotLine.state,
    })
    .from(workOrderLine)
    .innerJoin(
      bomSnapshotLine,
      eq(bomSnapshotLine.id, workOrderLine.snapshotLineId),
    )
    .where(eq(workOrderLine.woId, woId));

  // Reservations per line
  const resvRows = await db
    .select({
      reservationId: reservation.id,
      snapshotLineId: reservation.snapshotLineId,
      lotId: reservation.lotSerialId,
      reservedQty: reservation.reservedQty,
      status: reservation.status,
      lotCode: inventoryLotSerial.lotCode,
    })
    .from(reservation)
    .leftJoin(
      inventoryLotSerial,
      eq(inventoryLotSerial.id, reservation.lotSerialId),
    )
    .where(eq(reservation.woId, woId));

  const lines: WoProgressLine[] = lineRows.map((l) => {
    const req = Number(l.requiredQty);
    const done = Number(l.completedQty);
    return {
      snapshotLineId: l.snapshotLineId,
      componentSku: l.componentSku,
      componentName: l.componentName,
      requiredQty: req,
      completedQty: done,
      issuedQty: Number(l.issuedQty),
      assembledQty: Number(l.assembledQty),
      reservedQty: Number(l.reservedQty),
      remainingQty: Math.max(0, req - done),
      state: l.state,
      reservations: resvRows
        .filter((r) => r.snapshotLineId === l.snapshotLineId)
        .map((r) => ({
          reservationId: r.reservationId,
          lotId: r.lotId,
          lotCode: r.lotCode ?? null,
          reservedQty: Number(r.reservedQty),
          status: r.status,
        })),
    };
  });
  const totalRequired = lines.reduce((s, l) => s + l.requiredQty, 0);
  const totalCompleted = lines.reduce((s, l) => s + l.completedQty, 0);

  return {
    woId: wo.id,
    woNo: wo.woNo,
    status: wo.status,
    totalRequired,
    totalCompleted,
    progressPercent:
      totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0,
    lines,
  };
}

/**
 * Helper: compute on_hand qty for 1 lot (từ inv_txn).
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
