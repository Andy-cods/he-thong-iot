/**
 * V4.1 Đợt 1a (KHO-01/12/15) — QC nhập kho theo DÒNG phiếu nhập.
 *
 * Luồng:
 *   - Nhận hàng (receivingEvents.postReceivingAtomic) tạo mỗi dòng phiếu nhập
 *     ↔ đúng 1 lô mới. Lô HOLD/QC_PENDING, dòng qc_status='PENDING' (trừ khi
 *     người nhận có quyền `approve:qcInspection` và chọn OK).
 *   - Màn "Chờ QC" liệt kê dòng PENDING (chờ kiểm) + FAIL (không đạt, có thể
 *     kiểm lại → Đạt).
 *   - `decideReceiptLineQc`: PASS → lô AVAILABLE; FAIL → lô HOLD/QC_FAIL.
 *     Cho FAIL→PASS (kiểm lại); KHÔNG cho PASS→FAIL (dùng HOLD thủ công).
 *   - Sau mỗi quyết định: tính lại `inbound_receipt.qc_flag` (KHO-15 — trước
 *     đây cột này không bao giờ được cập nhật).
 *
 * D3: dòng cũ (qc_status NULL) coi là đạt, không hiện ở "Chờ QC".
 */
import { and, eq, sql } from "drizzle-orm";
import {
  bomSnapshotLine,
  inboundReceipt,
  inboundReceiptLine,
  inventoryLotSerial,
  purchaseOrderLine,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { releaseLotReservationsTx } from "./reservations";
import type { Tx } from "./stockGuard";

export type ReceiptLineQcStatus = "PENDING" | "PASS" | "FAIL";
export type ReceiptQcFlag = "PENDING" | "PASS" | "FAIL";

export class QcDecisionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "QcDecisionError";
  }
}

/**
 * THUẦN — trạng thái QC tổng của phiếu nhập từ trạng thái các dòng:
 * có FAIL → FAIL; còn PENDING → PENDING; còn lại → PASS.
 * `null` (dòng cũ trước V4.1) = đạt (D3).
 */
export function computeReceiptQcFlag(
  statuses: Array<string | null | undefined>,
): ReceiptQcFlag {
  if (statuses.some((s) => s === "FAIL")) return "FAIL";
  if (statuses.some((s) => s === "PENDING")) return "PENDING";
  return "PASS";
}

/** Tính lại + ghi `inbound_receipt.qc_flag`. Trả flag mới. */
export async function recomputeReceiptQcFlag(
  tx: Tx,
  receiptId: string,
  userId: string | null,
): Promise<ReceiptQcFlag> {
  const lines = await tx
    .select({ qcStatus: inboundReceiptLine.qcStatus })
    .from(inboundReceiptLine)
    .where(eq(inboundReceiptLine.receiptId, receiptId));
  const flag = computeReceiptQcFlag(lines.map((l) => l.qcStatus));
  await tx
    .update(inboundReceipt)
    .set({
      qcFlag: flag,
      qcCheckedAt: flag === "PENDING" ? null : new Date(),
      qcCheckedBy: flag === "PENDING" ? null : userId,
    })
    .where(eq(inboundReceipt.id, receiptId));
  return flag;
}

/**
 * THUẦN — state đích của bom_snapshot_line theo kết quả QC.
 *  - mode "receive" (lúc nhận hàng) — GIỮ NGUYÊN logic V1.2 B5.2:
 *      PENDING: PURCHASING → INBOUND_QC · PASS: → AVAILABLE · FAIL: → PLANNED.
 *  - mode "decide" (QC kết luận sau) — thận trọng hơn, không kéo lùi dòng đã
 *      giữ chỗ/xuất/lắp: PASS chỉ từ PLANNED/PURCHASING/INBOUND_QC → AVAILABLE;
 *      FAIL chỉ INBOUND_QC → PLANNED.
 */
export function snapshotQcTarget(
  currentState: string,
  qc: ReceiptLineQcStatus,
  mode: "receive" | "decide",
): string | null {
  if (mode === "receive") {
    if (qc === "PENDING") return currentState === "PURCHASING" ? "INBOUND_QC" : null;
    if (qc === "PASS") return "AVAILABLE";
    return "PLANNED";
  }
  if (qc === "PASS") {
    return ["PLANNED", "PURCHASING", "INBOUND_QC"].includes(currentState)
      ? "AVAILABLE"
      : null;
  }
  if (qc === "FAIL") return currentState === "INBOUND_QC" ? "PLANNED" : null;
  return null;
}

/**
 * Cập nhật bom_snapshot_line theo QC (dùng chung nhận hàng + màn Chờ QC).
 * - receivedDelta: cộng received_qty (chỉ lúc nhận hàng).
 * - PASS: qc_pass_qty += qty.
 */
export async function applySnapshotQc(
  tx: Tx,
  input: {
    snapshotLineId: string;
    qty: number;
    qc: ReceiptLineQcStatus;
    mode: "receive" | "decide";
    receivedDelta?: number;
    userId: string | null;
  },
): Promise<{ updated: boolean; newState: string | null }> {
  const [cur] = await tx
    .select({
      id: bomSnapshotLine.id,
      state: bomSnapshotLine.state,
      versionLock: bomSnapshotLine.versionLock,
    })
    .from(bomSnapshotLine)
    .where(eq(bomSnapshotLine.id, input.snapshotLineId))
    .limit(1);
  if (!cur) return { updated: false, newState: null };

  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  if (input.receivedDelta) {
    updateSet.receivedQty = sql`${bomSnapshotLine.receivedQty} + ${input.receivedDelta}`;
  }
  if (input.qc === "PASS") {
    updateSet.qcPassQty = sql`${bomSnapshotLine.qcPassQty} + ${input.qty}`;
  }
  const target = snapshotQcTarget(cur.state, input.qc, input.mode);
  if (target) {
    updateSet.state = target;
    updateSet.versionLock = cur.versionLock + 1;
    updateSet.transitionedAt = new Date();
    updateSet.transitionedBy = input.userId;
  }
  const [after] = await tx
    .update(bomSnapshotLine)
    .set(updateSet)
    .where(eq(bomSnapshotLine.id, input.snapshotLineId))
    .returning({ state: bomSnapshotLine.state });
  return { updated: true, newState: after?.state ?? cur.state };
}

/* ── Danh sách Chờ QC ─────────────────────────────────────────────────── */

export interface PendingQcRow {
  lineId: string;
  receiptId: string;
  receiptNo: string;
  receivedAt: string;
  receivedByUsername: string | null;
  poId: string | null;
  poNo: string | null;
  supplierName: string | null;
  itemId: string;
  sku: string;
  itemName: string;
  uom: string;
  receivedQty: number;
  lotSerialId: string | null;
  lotCode: string | null;
  lotStatus: string | null;
  holdCode: string | null;
  binCode: string | null;
  qcStatus: ReceiptLineQcStatus;
  qcNotes: string | null;
  qcCheckedAt: string | null;
  qcCheckedByUsername: string | null;
}

export async function listPendingQc(
  opts: { status?: "PENDING" | "FAIL" | "ALL"; q?: string | null; limit?: number } = {},
): Promise<PendingQcRow[]> {
  const status = opts.status ?? "ALL";
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const statusFilter =
    status === "ALL"
      ? sql`rl.qc_status IN ('PENDING', 'FAIL')`
      : sql`rl.qc_status = ${status}`;
  const q = opts.q?.trim();
  const qFilter = q
    ? sql`AND (i.sku ILIKE ${"%" + q + "%"} OR i.name ILIKE ${"%" + q + "%"}
              OR r.receipt_no ILIKE ${"%" + q + "%"} OR po.po_no ILIKE ${"%" + q + "%"}
              OR ls.lot_code ILIKE ${"%" + q + "%"})`
    : sql``;

  const rows = (await db.execute(sql`
    SELECT
      rl.id::text                AS line_id,
      rl.receipt_id::text        AS receipt_id,
      r.receipt_no,
      r.received_at::text        AS received_at,
      rb.username                AS received_by_username,
      po.id::text                AS po_id,
      po.po_no,
      s.name                     AS supplier_name,
      rl.item_id::text           AS item_id,
      i.sku,
      i.name                     AS item_name,
      i.uom::text                AS uom,
      rl.received_qty::text      AS received_qty,
      rl.lot_serial_id::text     AS lot_serial_id,
      COALESCE(ls.lot_code, rl.lot_code) AS lot_code,
      ls.status::text            AS lot_status,
      ls.hold_code,
      lb.full_code               AS bin_code,
      rl.qc_status,
      rl.qc_notes,
      rl.qc_checked_at::text     AS qc_checked_at,
      qu.username                AS qc_checked_by_username
    FROM app.inbound_receipt_line rl
    JOIN app.inbound_receipt r        ON r.id = rl.receipt_id
    JOIN app.item i                   ON i.id = rl.item_id
    LEFT JOIN app.purchase_order po   ON po.id = r.po_id
    LEFT JOIN app.supplier s          ON s.id = po.supplier_id
    LEFT JOIN app.inventory_lot_serial ls ON ls.id = rl.lot_serial_id
    LEFT JOIN app.location_bin lb     ON lb.id = rl.location_bin_id
    LEFT JOIN app.user_account rb     ON rb.id = r.received_by
    LEFT JOIN app.user_account qu     ON qu.id = rl.qc_checked_by
    WHERE ${statusFilter}
      ${qFilter}
    ORDER BY CASE WHEN rl.qc_status = 'PENDING' THEN 0 ELSE 1 END, r.received_at ASC, rl.id
    LIMIT ${limit}
  `)) as unknown as Array<Record<string, string | null>>;

  return rows.map((r) => ({
    lineId: r.line_id!,
    receiptId: r.receipt_id!,
    receiptNo: r.receipt_no!,
    receivedAt: r.received_at!,
    receivedByUsername: r.received_by_username ?? null,
    poId: r.po_id ?? null,
    poNo: r.po_no ?? null,
    supplierName: r.supplier_name ?? null,
    itemId: r.item_id!,
    sku: r.sku!,
    itemName: r.item_name!,
    uom: r.uom!,
    receivedQty: Number(r.received_qty ?? 0),
    lotSerialId: r.lot_serial_id ?? null,
    lotCode: r.lot_code ?? null,
    lotStatus: r.lot_status ?? null,
    holdCode: r.hold_code ?? null,
    binCode: r.bin_code ?? null,
    qcStatus: (r.qc_status ?? "PENDING") as ReceiptLineQcStatus,
    qcNotes: r.qc_notes ?? null,
    qcCheckedAt: r.qc_checked_at ?? null,
    qcCheckedByUsername: r.qc_checked_by_username ?? null,
  }));
}

/** Đếm cho badge "Chờ QC" (chỉ dòng PENDING — FAIL không cần hành động gấp). */
export async function countPendingQc(): Promise<{ pending: number; failed: number }> {
  const rows = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE qc_status = 'PENDING')::int AS pending,
      COUNT(*) FILTER (WHERE qc_status = 'FAIL')::int    AS failed
    FROM app.inbound_receipt_line
    WHERE qc_status IN ('PENDING', 'FAIL')
  `)) as unknown as Array<{ pending: number; failed: number }>;
  return { pending: rows[0]?.pending ?? 0, failed: rows[0]?.failed ?? 0 };
}

/* ── Kết luận QC 1 dòng ───────────────────────────────────────────────── */

export interface DecideQcResult {
  lineId: string;
  receiptId: string;
  receiptNo: string;
  poId: string | null;
  poNo: string | null;
  itemId: string;
  sku: string;
  lotSerialId: string;
  lotCode: string | null;
  qty: number;
  previousStatus: ReceiptLineQcStatus;
  result: "PASS" | "FAIL";
  lotStatus: string;
  receiptQcFlag: ReceiptQcFlag;
  releasedReservations: number;
}

export async function decideReceiptLineQc(input: {
  lineId: string;
  result: "PASS" | "FAIL";
  notes: string | null;
  userId: string;
}): Promise<DecideQcResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);

    // 1) Khoá dòng phiếu nhập
    const [line] = await tx
      .select()
      .from(inboundReceiptLine)
      .where(eq(inboundReceiptLine.id, input.lineId))
      .limit(1)
      .for("update");
    if (!line) {
      throw new QcDecisionError("NOT_FOUND", "Không tìm thấy dòng phiếu nhập.", 404);
    }
    const prev = line.qcStatus as ReceiptLineQcStatus | null;
    if (prev !== "PENDING" && prev !== "FAIL") {
      throw new QcDecisionError(
        "INVALID_STATE",
        prev === "PASS"
          ? "Dòng này đã kết luận Đạt. Muốn giữ lại hàng hãy dùng HOLD thủ công ở màn Lô/Serial."
          : "Dòng nhập trước V4.1 không qua QC nhập kho (coi là đạt).",
      );
    }
    if (prev === "FAIL" && input.result === "FAIL") {
      throw new QcDecisionError("INVALID_STATE", "Dòng này đã kết luận Không đạt.");
    }
    if (!line.lotSerialId) {
      throw new QcDecisionError(
        "NO_LOT",
        "Dòng phiếu nhập chưa gắn lô — không kết luận QC được.",
      );
    }

    // 2) Khoá item (cùng thứ tự với guard xuất: item → lô) rồi khoá lô
    await tx.execute(sql`SELECT app.reservation_lock(${line.itemId}::uuid)`);
    const [lot] = await tx
      .select()
      .from(inventoryLotSerial)
      .where(eq(inventoryLotSerial.id, line.lotSerialId))
      .limit(1)
      .for("update");
    if (!lot) {
      throw new QcDecisionError("NO_LOT", "Không tìm thấy lô của dòng phiếu nhập.", 404);
    }

    // 3) Cập nhật lô
    let lotStatus: string = lot.status;
    let releasedReservations = 0;
    const [hdr] = await tx
      .select({ receiptNo: inboundReceipt.receiptNo, poId: inboundReceipt.poId })
      .from(inboundReceipt)
      .where(eq(inboundReceipt.id, line.receiptId))
      .limit(1);
    const receiptNo = hdr?.receiptNo ?? "";

    if (input.result === "PASS") {
      if (lot.status === "HOLD") {
        if (lot.holdCode === "MANUAL") {
          throw new QcDecisionError(
            "LOT_MANUAL_HOLD",
            "Lô đang bị giữ HOLD thủ công — nhả HOLD ở màn Lô/Serial trước khi kết luận Đạt.",
          );
        }
        await tx
          .update(inventoryLotSerial)
          .set({ status: "AVAILABLE", holdCode: null, holdReason: null })
          .where(eq(inventoryLotSerial.id, lot.id));
        lotStatus = "AVAILABLE";
      }
      // AVAILABLE/CONSUMED: giữ nguyên lô, chỉ ghi kết luận cho dòng.
    } else {
      if (lot.status === "CONSUMED" || lot.status === "EXPIRED") {
        throw new QcDecisionError(
          "LOT_CONSUMED",
          `Lô đã ${lot.status === "CONSUMED" ? "xuất hết" : "hết hạn"} — không đặt Không đạt được.`,
        );
      }
      await tx
        .update(inventoryLotSerial)
        .set({
          status: "HOLD",
          holdCode: "QC_FAIL",
          holdReason: `QC không đạt (${receiptNo}): ${input.notes ?? ""}`.slice(0, 500),
        })
        .where(eq(inventoryLotSerial.id, lot.id));
      lotStatus = "HOLD";
      // KHO-06 — lô hỏng không được giữ chỗ cho lệnh SX nữa.
      releasedReservations = await releaseLotReservationsTx(tx, {
        lotSerialId: lot.id,
        userId: input.userId,
        reason: "QC_FAIL",
      });
    }

    // 4) Ghi kết luận dòng
    await tx
      .update(inboundReceiptLine)
      .set({
        qcStatus: input.result,
        qcCheckedBy: input.userId,
        qcCheckedAt: new Date(),
        qcNotes: input.notes,
      })
      .where(
        and(
          eq(inboundReceiptLine.id, line.id),
          sql`${inboundReceiptLine.qcStatus} = ${prev}`,
        ),
      );

    // 5) Snapshot line (qua PO line) — cộng qc_pass_qty + chuyển state
    const [poLine] = await tx
      .select({ snapshotLineId: purchaseOrderLine.snapshotLineId })
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.id, line.poLineId))
      .limit(1);
    if (poLine?.snapshotLineId) {
      await applySnapshotQc(tx, {
        snapshotLineId: poLine.snapshotLineId,
        qty: Number(line.receivedQty),
        qc: input.result,
        mode: "decide",
        userId: input.userId,
      });
    }

    // 6) qc_flag phiếu nhập (KHO-15)
    const receiptQcFlag = await recomputeReceiptQcFlag(tx, line.receiptId, input.userId);

    const info = (await tx.execute(sql`
      SELECT i.sku, po.po_no
      FROM app.item i
      LEFT JOIN app.purchase_order po ON po.id = ${hdr?.poId ?? null}::uuid
      WHERE i.id = ${line.itemId}
      LIMIT 1
    `)) as unknown as Array<{ sku: string; po_no: string | null }>;

    return {
      lineId: line.id,
      receiptId: line.receiptId,
      receiptNo,
      poId: hdr?.poId ?? null,
      poNo: info[0]?.po_no ?? null,
      itemId: line.itemId,
      sku: info[0]?.sku ?? "",
      lotSerialId: lot.id,
      lotCode: lot.lotCode,
      qty: Number(line.receivedQty),
      previousStatus: prev,
      result: input.result,
      lotStatus,
      receiptQcFlag,
      releasedReservations,
    };
  });
}
