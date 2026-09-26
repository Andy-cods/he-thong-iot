import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  inboundReceipt,
  inboundReceiptLine,
  inventoryLotSerial,
  inventoryTxn,
  item,
  locationBin,
  purchaseOrder,
  purchaseOrderLine,
  receivingEvent,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import {
  acceptedQtyOf,
  nextPoStatusAfterReceipt,
} from "../../lib/procurement-policy";
import { currentYymm, genDocNo } from "./_docNumber";
import { applySnapshotQc, recomputeReceiptQcFlag } from "./inboundQc";
import { getPOLineReceiptStats } from "./purchaseOrders";

/**
 * V4.1 hotfix — bin hệ thống "Chờ xếp kệ" (migration 0058). Nhận hàng KHÔNG
 * BAO GIỜ được phép insert to_bin_id = NULL nữa: NULL bin bị view
 * app.bin_inventory (migration 0034) loại hoàn toàn khỏi mọi màn hình Kho
 * → hàng "biến mất" dù đã nhận. Nếu user không chọn bin và item không có
 * default_bin_id, hàng tự vào bin này để LUÔN nhìn thấy được, xếp lại sau.
 */
const STAGING_BIN_WAREHOUSE_CODE = "WH-01";
const STAGING_BIN_ZONE = "STAGING";
const STAGING_BIN_CODE = "CHO-XEP-KE";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

let cachedStagingBinId: string | null = null;

/**
 * Resolve id của bin "Chờ xếp kệ". Cache trong module vì bin này bất biến
 * (tạo 1 lần bởi migration 0058, không bị xoá/sửa trong vận hành bình thường).
 * Nếu không tìm thấy → throw rõ ràng thay vì âm thầm insert NULL (thà fail to
 * còn hơn mất hàng âm thầm — yêu cầu hotfix).
 */
async function resolveStagingBinId(tx: Tx): Promise<string> {
  if (cachedStagingBinId) return cachedStagingBinId;

  const [bin] = await tx
    .select({ id: locationBin.id })
    .from(locationBin)
    .where(
      and(
        eq(locationBin.warehouseCode, STAGING_BIN_WAREHOUSE_CODE),
        eq(locationBin.zone, STAGING_BIN_ZONE),
        eq(locationBin.binCode, STAGING_BIN_CODE),
      ),
    )
    .limit(1);

  if (!bin) {
    throw new Error(
      "STAGING_BIN_NOT_FOUND: Không tìm thấy bin hệ thống 'Chờ xếp kệ' " +
        `(warehouse_code=${STAGING_BIN_WAREHOUSE_CODE}, zone=${STAGING_BIN_ZONE}, bin_code=${STAGING_BIN_CODE}). ` +
        "Chạy migration 0058_staging_bin_fix_null_bin.sql trước khi nhận hàng — " +
        "KHÔNG được insert inventory_txn với to_bin_id NULL (gây mất tồn kho âm thầm).",
    );
  }

  cachedStagingBinId = bin.id;
  return cachedStagingBinId;
}

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

/**
 * V3.11.3 (audit 1.2) — kiểm tra 1 receiving_event đã thực sự post tồn kho
 * chưa, dựa vào cột mốc `metadata.inventoryTxnId` (chỉ được ghi ở bước 9 của
 * postReceivingAtomic, trong cùng transaction với inventory_txn).
 *
 * Dùng để phân biệt:
 *  - Duplicate THẬT (đã post rồi) → ack idempotent, KHÔNG post lại.
 *  - Event MỒ CÔI (insertEvent commit ở lần trước nhưng post fail giữa chừng)
 *    → cần re-post, nếu không dữ liệu nhận hàng mất vĩnh viễn.
 */
export async function getEventPostState(
  scanId: string,
): Promise<{ exists: boolean; posted: boolean }> {
  const [row] = await db
    .select({
      txnId: sql<string | null>`${receivingEvent.metadata} ->> 'inventoryTxnId'`,
    })
    .from(receivingEvent)
    .where(eq(receivingEvent.scanId, scanId))
    .limit(1);
  if (!row) return { exists: false, posted: false };
  return { exists: true, posted: Boolean(row.txnId) };
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
 * 3) Tạo inventory_lot_serial MỚI cho mỗi dòng nhận (V4.1 D5 — trùng mã lô → tách -N)
 * 4) INSERT inventory_txn tx_type=IN_RECEIPT
 * 5) UPDATE purchase_order_line.received_qty += qty
 * 6) UPDATE bom_snapshot_line.received_qty += qty (qua po_line.snapshot_line_id)
 * 7) (QC flow) transition state PURCHASING → INBOUND_QC (nếu applicable)
 *
 * Tất cả atomic trong 1 Drizzle transaction. Trả về chi tiết kết quả.
 *
 * V4.1 Đợt 1a:
 *  - KHO-08: khoá PO + chỉ nhận khi PO ở SENT/PARTIAL/RECEIVED.
 *  - KHO-01: lô mới HOLD/QC_PENDING cho tới khi QC kết luận (OK chỉ hiệu lực
 *    với người có `approve:qcInspection` — caller truyền `canApproveQc`).
 *  - KHO-07/D5: LUÔN tạo lô mới; mã lô đã có (cùng item) → tách `-2`, `-3`…
 *  - KHO-15: dòng phiếu nhập ghi qc_status + lot_serial_id; tính lại qc_flag.
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
  /**
   * V1.2 B5.2: QC status của sự kiện scan này.
   * - OK: snapshot transition INBOUND_QC→AVAILABLE + qc_pass_qty += qty.
   * - NG: lot status HOLD + snapshot rollback INBOUND_QC→PLANNED.
   * - PENDING (default): chờ QC ở màn "Chờ QC" (giữ INBOUND_QC).
   */
  qcStatus?: "OK" | "NG" | "PENDING";
  /**
   * V4.1 KHO-01 — người nhận có `approve:qcInspection` không. Không có quyền
   * mà gửi OK → hạ về PENDING (không báo lỗi), ghi metadata.qcDowngraded.
   */
  canApproveQc?: boolean;
}

export interface PostReceivingResult {
  receiptId: string;
  receiptNo: string;
  receiptLineId: string;
  inventoryTxnId: string;
  lotSerialId: string;
  /** V4.1 D5 — mã lô THỰC TẾ đã ghi (có thể đã tách thành `<mã>-N`). */
  lotCode: string | null;
  /** true nếu mã lô bị tách do trùng lô cũ cùng mã hàng. */
  lotSplit: boolean;
  lotStatus: "AVAILABLE" | "HOLD" | "CONSUMED" | "EXPIRED";
  /** Trạng thái QC hiệu lực sau khi xét quyền (OK có thể bị hạ PENDING). */
  qcStatus: "OK" | "NG" | "PENDING";
  qcDowngraded: boolean;
  snapshotLineUpdated: boolean;
  newSnapshotState: string | null;
  poStatus: string | null;
  overDelivery: boolean;
}

/** V3.2 — soft over-delivery threshold (warning), hard block ngưỡng. */
const OVER_DELIVERY_WARN_RATIO = 1.05; // > 105%: log warning
const OVER_DELIVERY_HARD_RATIO = 1.20; // > 120%: throw OVER_DELIVERY_REJECTED

/** V4.1 KHO-08 — PO ở các trạng thái này mới được nhận hàng. */
export const RECEIVABLE_PO_STATUSES = ["SENT", "PARTIAL", "RECEIVED"] as const;

/** Độ dài tối đa cột inventory_lot_serial.lot_code. */
const LOT_CODE_MAX = 64;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * V4.1 D5 — THUẦN: mã lô cho lần nhận mới khi `base` có thể đã tồn tại.
 * `existing` = các mã lô của CÙNG item bằng `base` hoặc dạng `base-N`.
 *  - base chưa có → dùng base.
 *  - đã có → `base-(maxN+1)`, maxN tính từ các hậu tố `-N` hiện có (tối thiểu 1).
 */
export function nextSplitLotCode(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  const re = new RegExp(`^${escapeRegex(base)}-(\\d+)$`);
  let max = 1;
  for (const code of existing) {
    const m = re.exec(code);
    if (m) max = Math.max(max, Number.parseInt(m[1]!, 10));
  }
  return `${base}-${max + 1}`;
}

/**
 * V4.1 KHO-01 — THUẦN: QC hiệu lực của lần nhận.
 * OK mà người nhận không có quyền QC → hạ về PENDING (downgraded=true).
 */
export function resolveReceiveQc(
  requested: "OK" | "NG" | "PENDING" | null | undefined,
  canApproveQc: boolean,
): { qc: "OK" | "NG" | "PENDING"; downgraded: boolean } {
  const req = requested ?? "PENDING";
  if (req === "OK" && !canApproveQc) return { qc: "PENDING", downgraded: true };
  return { qc: req, downgraded: false };
}

/**
 * V4.1 D5 — chọn mã lô thực tế cho (item, base) trong transaction. Advisory
 * lock theo (item, base) để 2 lần nhận song song cùng mã không cùng ra `-2`;
 * unique index `inventory_lot_uk (item_id, lot_code)` là chốt chặn cuối.
 */
export async function resolveReceiptLotCode(
  tx: Tx,
  itemId: string,
  base: string,
): Promise<string> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${"lotcode:" + itemId + ":" + base}))`,
  );
  const rows = (await tx.execute(sql`
    SELECT lot_code
    FROM app.inventory_lot_serial
    WHERE item_id = ${itemId}
      AND lot_code IS NOT NULL
      AND (lot_code = ${base} OR left(lot_code, ${base.length + 1}) = ${base + "-"})
  `)) as unknown as Array<{ lot_code: string }>;
  const code = nextSplitLotCode(
    base,
    rows.map((r) => r.lot_code),
  );
  if (code.length > LOT_CODE_MAX) {
    throw new Error(
      `LOT_CODE_TOO_LONG: mã lô "${code}" vượt ${LOT_CODE_MAX} ký tự sau khi tách lô — rút ngắn mã lô.`,
    );
  }
  return code;
}

export async function postReceivingAtomic(
  input: PostReceivingInput,
): Promise<PostReceivingResult> {
  return db.transaction(async (tx) => {
    // 0) V4.1 KHO-08 — khoá PO header TRƯỚC (thứ tự: PO → PO line) + chỉ nhận
    //    PO đã gửi NCC. DRAFT/CANCELLED/CLOSED trước đây vẫn nhận được và
    //    CANCELLED còn tự nhảy thành RECEIVED.
    const [po] = await tx
      .select({
        id: purchaseOrder.id,
        poNo: purchaseOrder.poNo,
        status: purchaseOrder.status,
      })
      .from(purchaseOrder)
      .where(eq(purchaseOrder.id, input.poId))
      .limit(1)
      .for("update");
    if (!po) throw new Error("PO_NOT_FOUND");
    if (!(RECEIVABLE_PO_STATUSES as readonly string[]).includes(po.status)) {
      throw new Error(
        `PO_NOT_RECEIVABLE: PO ${po.poNo} đang ở trạng thái ${po.status} — chỉ nhận hàng khi PO đã gửi NCC (SENT/PARTIAL).`,
      );
    }

    // 1) Validate PO line
    // V3.11.4 (audit 1.5) — FOR UPDATE: khoá row PO line để nhiều scan song song
    // cùng line tuần tự nhau; guard over-delivery 120% (bước 1b) + cộng dồn
    // received_qty (bước 6) đọc/ghi trên số liệu nhất quán, không vượt trần.
    const [poLine] = await tx
      .select()
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.id, input.poLineId))
      .limit(1)
      .for("update");
    if (!poLine) throw new Error("PO_LINE_NOT_FOUND");
    if (poLine.poId !== input.poId || poLine.itemId !== input.itemId) {
      throw new Error(
        "PO_LINE_MISMATCH: dòng PO không thuộc PO/mã hàng đang nhận.",
      );
    }

    // V3.7 — Slotting: nếu caller không truyền locationBinId, fallback default_bin_id của item.
    // V4.1 hotfix — nếu vẫn không có (item cũng chưa gán default_bin) → fallback
    // bin "Chờ xếp kệ". KHÔNG BAO GIỜ để resolvedBinId = null khi insert
    // inventory_txn IN_RECEIPT (xem resolveStagingBinId + migration 0058).
    let resolvedBinId: string | null = input.locationBinId ?? null;
    if (!resolvedBinId) {
      const [itm] = await tx
        .select({ defaultBinId: item.defaultBinId })
        .from(item)
        .where(eq(item.id, input.itemId))
        .limit(1);
      if (itm?.defaultBinId) resolvedBinId = itm.defaultBinId;
    }
    if (!resolvedBinId) {
      resolvedBinId = await resolveStagingBinId(tx);
    }

    // 1b) V3.2 — hard block over-delivery > 120% để tránh nhập sai SL nghiêm trọng
    // V4.1 TM-16 — tính trên SL ĐẠT (trừ hàng QC không đạt) để NCC giao bù
    // hàng NG không bị chặn nhầm là giao vượt.
    const lineStatsBefore = await getPOLineReceiptStats(input.poId, tx);
    {
      const ordered = Number.parseFloat(poLine.orderedQty);
      const cur = lineStatsBefore.find((l) => l.id === poLine.id);
      const already = cur
        ? acceptedQtyOf(cur)
        : Number.parseFloat(poLine.receivedQty);
      const projected = already + input.qty;
      if (ordered > 0 && projected > ordered * OVER_DELIVERY_HARD_RATIO) {
        throw new Error(
          `OVER_DELIVERY_REJECTED: nhận ${projected.toFixed(2)} > ${(ordered * OVER_DELIVERY_HARD_RATIO).toFixed(2)} (${Math.round(OVER_DELIVERY_HARD_RATIO * 100)}% của ${ordered}). Liên hệ admin để chỉnh đặt hàng.`,
        );
      }
    }

    // 2) Find/create inbound_receipt header (1 per po + ngày)
    // V4.1 TM-24 — "ngày" theo giờ Việt Nam ở CẢ HAI vế (trước đây so ngày UTC
    // của Node với ngày theo TZ phiên DB → 0h-7h sáng tách thêm phiếu nhập).
    const [existingHeader] = await tx
      .select()
      .from(inboundReceipt)
      .where(
        and(
          eq(inboundReceipt.poId, input.poId),
          sql`(${inboundReceipt.receivedAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`,
        ),
      )
      .limit(1);

    let receiptId: string;
    let receiptNo: string;
    if (existingHeader) {
      receiptId = existingHeader.id;
      receiptNo = existingHeader.receiptNo;
    } else {
      // V3.11.4 (audit 1.8/1.21) — advisory lock + MAX(seq)+1 thay COUNT(*)+1
      // (COUNT sai khi có gap + không lock → trùng số phiếu nhập).
      receiptNo = await genDocNo(tx, {
        table: "app.inbound_receipt",
        column: "receipt_no",
        prefix: `RCV-${currentYymm()}`,
        seqPart: 3,
      });

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

    // 3) V4.1 KHO-01 — QC hiệu lực (OK không có quyền → PENDING).
    const { qc, downgraded: qcDowngraded } = resolveReceiveQc(
      input.qcStatus,
      input.canApproveQc ?? false,
    );
    const lotStatus: "AVAILABLE" | "HOLD" = qc === "OK" ? "AVAILABLE" : "HOLD";
    const holdCode: "QC_PENDING" | "QC_FAIL" | null =
      qc === "OK" ? null : qc === "NG" ? "QC_FAIL" : "QC_PENDING";
    const holdReason =
      qc === "OK"
        ? null
        : qc === "NG"
          ? `QC không đạt khi nhận hàng (${receiptNo})`
          : `Chờ QC nhập kho (${receiptNo})`;

    // 4) V4.1 D5 — LUÔN tạo lô MỚI cho mỗi dòng nhận. Trước đây nhận vào mã lô
    //    đã có thì dùng lại lô cũ: lô CONSUMED nhận thêm → hàng "biến mất";
    //    NG khoá lây sang hàng tốt nhận trước (KHO-07). Mã lô trùng → tách -N.
    const requestedLot = input.lotCode?.trim() || null;
    const lotCode = requestedLot
      ? await resolveReceiptLotCode(tx, input.itemId, requestedLot)
      : null;
    const lotSplit = requestedLot !== null && lotCode !== requestedLot;

    const [newLot] = await tx
      .insert(inventoryLotSerial)
      .values({
        itemId: input.itemId,
        lotCode,
        serialCode: input.serialCode ?? null,
        // Lô không mã → supplier_ref = số phiếu nhập để truy vết.
        supplierRef: lotCode || input.serialCode ? null : receiptNo,
        status: lotStatus,
        holdCode,
        holdReason,
        notes: lotSplit
          ? `Tách lô: mã ${requestedLot} đã tồn tại, ghi thành ${lotCode}`
          : null,
      })
      .returning({ id: inventoryLotSerial.id });
    if (!newLot) throw new Error("LOT_INSERT_FAILED");
    const lotSerialId = newLot.id;

    // 5) Insert inbound_receipt_line (gắn lô + trạng thái QC theo dòng)
    const lineQc: "PENDING" | "PASS" | "FAIL" =
      qc === "OK" ? "PASS" : qc === "NG" ? "FAIL" : "PENDING";
    const [receiptLine] = await tx
      .insert(inboundReceiptLine)
      .values({
        receiptId,
        poLineId: input.poLineId,
        itemId: input.itemId,
        receivedQty: String(input.qty),
        locationBinId: resolvedBinId,
        lotCode,
        serialCode: input.serialCode ?? null,
        notes: input.notes ?? null,
        lotSerialId,
        qcStatus: lineQc,
        qcCheckedBy: lineQc === "PENDING" ? null : input.userId,
        qcCheckedAt: lineQc === "PENDING" ? null : new Date(),
        qcNotes: lineQc === "FAIL" ? "Không đạt khi nhận hàng" : null,
      })
      .returning();
    if (!receiptLine) throw new Error("RECEIPT_LINE_INSERT_FAILED");

    // 6) Insert inventory_txn IN_RECEIPT
    const [txn] = await tx
      .insert(inventoryTxn)
      .values({
        txType: "IN_RECEIPT",
        itemId: input.itemId,
        qty: String(input.qty),
        toBinId: resolvedBinId,
        lotSerialId,
        refTable: "inbound_receipt_line",
        refId: receiptLine.id,
        postedBy: input.userId,
        notes: input.notes ?? null,
      })
      .returning({ id: inventoryTxn.id });
    if (!txn) throw new Error("INVENTORY_TXN_INSERT_FAILED");

    // 7) UPDATE PO line received_qty
    await tx
      .update(purchaseOrderLine)
      .set({
        receivedQty: sql`${purchaseOrderLine.receivedQty} + ${input.qty}`,
      })
      .where(eq(purchaseOrderLine.id, input.poLineId));

    // 8) UPDATE PO status nếu tất cả line đều đủ (→ RECEIVED) hoặc partial (→ PARTIAL)
    // V4.1 TM-16 — "đủ" tính theo SL ĐẠT (dòng phiếu nhập vừa ghi FAIL đã nằm
    // trong thống kê) → nhận hàng NG không làm PO thành RECEIVED.
    const nextStatus = nextPoStatusAfterReceipt(
      await getPOLineReceiptStats(input.poId, tx),
    );
    const allFull = nextStatus === "RECEIVED";
    const anyReceived = nextStatus !== null;

    // V4.1 KHO-08 — chỉ chuyển trạng thái từ SENT/PARTIAL. PO đã RECEIVED
    // (nhận vượt) giữ nguyên + poStatus=null → route không bắn notify lặp.
    let poStatus: string | null = null;
    if (allFull) {
      const [updated] = await tx
        .update(purchaseOrder)
        .set({ status: "RECEIVED" })
        .where(
          and(
            eq(purchaseOrder.id, input.poId),
            inArray(purchaseOrder.status, ["SENT", "PARTIAL"]),
          ),
        )
        .returning({ status: purchaseOrder.status });
      poStatus = updated?.status ?? null;
    } else if (anyReceived) {
      const [updated] = await tx
        .update(purchaseOrder)
        .set({ status: "PARTIAL" })
        .where(
          and(
            eq(purchaseOrder.id, input.poId),
            eq(purchaseOrder.status, "SENT"),
          ),
        )
        .returning({ status: purchaseOrder.status });
      poStatus = updated?.status ?? null;
    }

    // Over-delivery warning: nhận > 105% ordered
    const orderedNum = Number.parseFloat(poLine.orderedQty);
    const receivedAfter =
      Number.parseFloat(poLine.receivedQty) + input.qty;
    const overDelivery = orderedNum > 0 && receivedAfter > orderedNum * OVER_DELIVERY_WARN_RATIO;

    // 9) UPDATE bom_snapshot_line + transition state theo QC HIỆU LỰC (đã hạ
    //    cấp nếu thiếu quyền): PENDING → INBOUND_QC, OK → AVAILABLE, NG → PLANNED.
    let snapshotLineUpdated = false;
    let newSnapshotState: string | null = null;
    if (poLine.snapshotLineId) {
      const snap = await applySnapshotQc(tx, {
        snapshotLineId: poLine.snapshotLineId,
        qty: input.qty,
        qc: lineQc,
        mode: "receive",
        receivedDelta: input.qty,
        userId: input.userId,
      });
      snapshotLineUpdated = snap.updated;
      newSnapshotState = snap.newState;
    }

    // 10) V4.1 KHO-15 — qc_flag phiếu nhập tính lại theo các dòng.
    await recomputeReceiptQcFlag(tx, receiptId, input.userId);

    // 11) Update receiving_event: qc_status + link chain qua metadata
    await tx
      .update(receivingEvent)
      .set({
        qcStatus: qc,
        metadata: sql`COALESCE(${receivingEvent.metadata}, '{}'::jsonb) || ${JSON.stringify(
          {
            inventoryTxnId: txn.id,
            receiptLineId: receiptLine.id,
            lotSerialId,
            lotCode,
            lotSplit,
            lotStatus,
            qcDowngraded,
            requestedQcStatus: input.qcStatus ?? "PENDING",
            poStatus,
            overDelivery,
            postedAt: new Date().toISOString(),
          },
        )}::jsonb`,
      })
      .where(eq(receivingEvent.id, input.scanEventId));

    return {
      receiptId,
      receiptNo,
      receiptLineId: receiptLine.id,
      inventoryTxnId: txn.id,
      lotSerialId,
      lotCode,
      lotSplit,
      lotStatus,
      qcStatus: qc,
      qcDowngraded,
      snapshotLineUpdated,
      newSnapshotState,
      poStatus,
      overDelivery,
    };
  });
}
