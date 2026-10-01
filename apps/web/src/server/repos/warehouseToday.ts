import { and, desc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import {
  locationBin,
  purchaseOrder,
  purchaseRequest,
  supplier,
  warehouseIssueRequest,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { countPendingQc } from "./inboundQc";
import { resolveStagingBinId } from "./stagingBin";

/**
 * V4.3 mục 3 — tổng hợp tab "Việc cần làm hôm nay":
 *  (a) lô đang ở "Chờ xếp kệ"
 *  (b) yêu cầu xuất chờ duyệt (ISR PENDING + PR đã duyệt/nhận hàng chưa xuất kho)
 *  (c) PO sắp về 3 ngày tới / quá hạn ETA
 *  (d) dòng chờ QC (tái dùng `countPendingQc`)
 *
 * Chỉ ĐỌC — không có logic ghi ở đây.
 */

const WARN_DAYS_DEFAULT = 3;

export interface EtaBucket {
  daysUntil: number;
  overdue: boolean;
}

/** THUẦN — số ngày còn lại tới `expectedEtaIso` tính từ `todayIso` (cắt giờ, chỉ so ngày). */
export function computeEtaBucket(expectedEtaIso: string, todayIso: string): EtaBucket {
  const eta = Date.parse(`${expectedEtaIso.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`);
  const daysUntil = Math.round((eta - today) / 86_400_000);
  return { daysUntil, overdue: daysUntil < 0 };
}

/** THUẦN — PO nên hiện trong "sắp về/quá hạn" nếu còn ≤ `warnDays` ngày (âm = đã quá hạn). */
export function isPoDueSoonOrOverdue(
  daysUntil: number,
  warnDays: number = WARN_DAYS_DEFAULT,
): boolean {
  return daysUntil <= warnDays;
}

export interface TodayStagingLot {
  lotSerialId: string;
  lotCode: string | null;
  itemId: string;
  sku: string;
  itemName: string;
  uom: string | null;
  qty: number;
  status: string;
}

export interface TodayPendingIssue {
  kind: "ISR" | "PR";
  id: string;
  code: string;
  reasonLabel: string | null;
  totalQty: number | null;
  requestedAt: string;
  href: string;
}

export interface TodayIncomingPo {
  poId: string;
  poNo: string;
  supplierName: string | null;
  expectedEta: string;
  daysUntil: number;
  overdue: boolean;
}

export interface WarehouseTodaySummary {
  staging: {
    binId: string | null;
    binFullCode: string | null;
    count: number;
    totalQty: number;
    items: TodayStagingLot[];
  };
  pendingIssues: { count: number; items: TodayPendingIssue[] };
  incomingPos: { count: number; items: TodayIncomingPo[] };
  qcPending: { count: number };
}

const ISR_REASON_LABEL: Record<string, string> = {
  production: "Sản xuất",
  sales: "Bán hàng",
  manual: "Thủ công",
  loss: "Hao hụt",
  return: "Trả NCC",
  other: "Khác",
};

async function getStagingLots(): Promise<WarehouseTodaySummary["staging"]> {
  let binId: string;
  try {
    binId = await resolveStagingBinId(db);
  } catch {
    return { binId: null, binFullCode: null, count: 0, totalQty: 0, items: [] };
  }

  const [binRow] = await db
    .select({ fullCode: locationBin.fullCode })
    .from(locationBin)
    .where(eq(locationBin.id, binId))
    .limit(1);

  const rows = await db.execute<{
    lot_serial_id: string;
    lot_code: string | null;
    item_id: string;
    sku: string;
    item_name: string;
    uom: string | null;
    qty: string;
    status: string;
  }>(sql`
    SELECT
      bi.lot_serial_id,
      ils.lot_code,
      bi.item_id,
      it.sku,
      it.name AS item_name,
      it.uom::text AS uom,
      bi.qty_on_hand::text AS qty,
      ils.status::text AS status
    FROM app.bin_inventory bi
    JOIN app.item it ON it.id = bi.item_id
    LEFT JOIN app.inventory_lot_serial ils ON ils.id = bi.lot_serial_id
    WHERE bi.bin_id = ${binId}
    ORDER BY ils.created_at ASC NULLS LAST
  `);

  const items = (rows as unknown as Array<(typeof rows)[number]>).map((r) => ({
    lotSerialId: r.lot_serial_id,
    lotCode: r.lot_code,
    itemId: r.item_id,
    sku: r.sku,
    itemName: r.item_name,
    uom: r.uom,
    qty: Number(r.qty ?? "0"),
    status: r.status,
  }));

  return {
    binId,
    binFullCode: binRow?.fullCode ?? null,
    count: items.length,
    totalQty: items.reduce((s, i) => s + i.qty, 0),
    items,
  };
}

async function getPendingIssues(): Promise<WarehouseTodaySummary["pendingIssues"]> {
  const [isrRows, prRows] = await Promise.all([
    db
      .select({
        id: warehouseIssueRequest.id,
        requestNo: warehouseIssueRequest.requestNo,
        reason: warehouseIssueRequest.reason,
        totalQty: warehouseIssueRequest.totalQty,
        createdAt: warehouseIssueRequest.createdAt,
      })
      .from(warehouseIssueRequest)
      .where(eq(warehouseIssueRequest.status, "PENDING"))
      .orderBy(desc(warehouseIssueRequest.createdAt))
      .limit(20),
    db
      .select({
        id: purchaseRequest.id,
        code: purchaseRequest.code,
        goodsReceivedAt: purchaseRequest.goodsReceivedAt,
      })
      .from(purchaseRequest)
      .where(
        and(
          isNotNull(purchaseRequest.goodsReceivedAt),
          isNull(purchaseRequest.goodsIssuedAt),
        ),
      )
      .orderBy(desc(purchaseRequest.goodsReceivedAt))
      .limit(20),
  ]);

  const items: TodayPendingIssue[] = [
    ...isrRows.map((r) => ({
      kind: "ISR" as const,
      id: r.id,
      code: r.requestNo,
      reasonLabel: ISR_REASON_LABEL[r.reason] ?? r.reason,
      totalQty: Number(r.totalQty ?? "0"),
      requestedAt: r.createdAt.toISOString(),
      href: "/warehouse?tab=movement&mode=out",
    })),
    ...prRows.map((r) => ({
      kind: "PR" as const,
      id: r.id,
      code: r.code,
      reasonLabel: "Đã nhận hàng — chờ xuất cho bộ phận",
      totalQty: null,
      requestedAt: (r.goodsReceivedAt ?? new Date()).toISOString(),
      href: `/procurement/purchase-requests/${r.id}`,
    })),
  ].sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));

  return { count: items.length, items };
}

async function getIncomingPos(warnDays: number): Promise<WarehouseTodaySummary["incomingPos"]> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() + warnDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const rows = await db
    .select({
      poId: purchaseOrder.id,
      poNo: purchaseOrder.poNo,
      supplierName: supplier.name,
      expectedEta: purchaseOrder.expectedEta,
    })
    .from(purchaseOrder)
    .leftJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(
      and(
        sql`${purchaseOrder.status} IN ('SENT', 'PARTIAL')`,
        isNotNull(purchaseOrder.expectedEta),
        lte(purchaseOrder.expectedEta, cutoffIso),
      ),
    )
    .orderBy(purchaseOrder.expectedEta)
    .limit(30);

  const items = rows
    .filter((r): r is typeof r & { expectedEta: string } => !!r.expectedEta)
    .map((r) => {
      const bucket = computeEtaBucket(r.expectedEta, todayIso);
      return {
        poId: r.poId,
        poNo: r.poNo,
        supplierName: r.supplierName ?? null,
        expectedEta: r.expectedEta,
        daysUntil: bucket.daysUntil,
        overdue: bucket.overdue,
      };
    })
    .filter((r) => isPoDueSoonOrOverdue(r.daysUntil, warnDays));

  return { count: items.length, items };
}

export async function getWarehouseTodaySummary(
  warnDays: number = WARN_DAYS_DEFAULT,
): Promise<WarehouseTodaySummary> {
  const [staging, pendingIssues, incomingPos, qc] = await Promise.all([
    getStagingLots(),
    getPendingIssues(),
    getIncomingPos(warnDays),
    countPendingQc(),
  ]);

  return {
    staging,
    pendingIssues,
    incomingPos,
    qcPending: { count: qc.pending },
  };
}
