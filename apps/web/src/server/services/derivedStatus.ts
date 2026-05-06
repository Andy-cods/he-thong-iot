import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Trụ cột 5 — Cross-module status sync.
 *
 * V3.7.50 — refactor để liên kết tiến độ thực tế với 3 nguồn:
 *   1) Inventory tồn kho (inventory_lot_serial + inventory_txn) → kind=stock 100%.
 *   2) Bom snapshot orders (bom_snapshot_line) → trạng thái mua hàng/xuất kho.
 *   3) Reservation đang giữ chỗ (reservation ACTIVE) → trừ vào stock_net.
 *
 * Trước đây chỉ aggregate `bom_snapshot_line`, nên BOM chưa có order luôn
 * trả "PLANNED" — gây cảm giác progress bar "đứng yên". Sau refactor:
 *   • LEFT JOIN từ `bom_line` của template (always có) ra inventory + snapshot.
 *   • Nếu `stock_net` ≥ `required` → AVAILABLE (100%) bất kể order.
 *   • Nếu chưa có order, có chút stock → status PARTIAL theo tỉ lệ stock/req.
 */

export type MaterialStatus =
  | "NO_ORDERS"     // Không có đơn hàng nào dùng BOM này (legacy, ít dùng sau V3.7.50)
  | "PLANNED"       // Chưa có PO + chưa có stock
  | "PURCHASING"    // Đang mua
  | "PARTIAL"       // Nhận một phần / có ít stock
  | "AVAILABLE"     // Đủ hàng
  | "ISSUED";       // Đã xuất vào sản xuất

export interface ComponentMaterialStatus {
  componentItemId: string;
  componentSku: string;
  componentName: string;
  totalRequired: string;
  totalReceived: string;
  totalShort: string;
  status: MaterialStatus;
  orderCount: number;
  pct: number;
  milestones: {
    planned: boolean;
    purchasing: boolean;
    purchased: boolean;
    available: boolean;
    issued: boolean;
  };
  totalPurchased: string;
  totalAvailable: string;
  totalIssued: string;
  /** V3.7.50 — stock thực còn dùng được (AVAILABLE − reserved). */
  stockAvailable: string;
  /** V3.7.50 — tổng stock các trạng thái (AVAILABLE+HOLD). */
  stockTotal: string;
}

export interface TemplateDerivedStatus {
  templateId: string;
  componentStatuses: ComponentMaterialStatus[];
  overallStatus: MaterialStatus;
  totalComponents: number;
  availableComponents: number;
}

interface RawRow {
  component_item_id: string;
  component_sku: string;
  component_name: string;
  total_required: string;
  total_received: string;
  total_purchased: string;
  total_available_snap: string;
  total_issued: string;
  all_issued: boolean;
  all_available: boolean;
  any_received: boolean;
  any_purchasing: boolean;
  any_issued: boolean;
  order_count: number;
  stock_available: string;
  stock_hold: string;
  stock_total: string;
  stock_reserved: string;
}

export async function computeTemplateDerivedStatus(
  templateId: string,
): Promise<TemplateDerivedStatus> {
  const rows = (await db.execute(sql`
    WITH template_components AS (
      SELECT
        bl.component_item_id,
        i.sku AS component_sku,
        i.name AS component_name,
        SUM(bl.qty_per_parent * (1 + COALESCE(bl.scrap_percent, 0) / 100.0)) AS req_per_unit
      FROM app.bom_line bl
      JOIN app.item i ON i.id = bl.component_item_id
      WHERE bl.template_id = ${templateId}
        AND COALESCE(bl.metadata #>> '{kind}', 'com') NOT IN ('fab')
      GROUP BY bl.component_item_id, i.sku, i.name
    ),
    lot_on_hand AS (
      SELECT
        l.id,
        l.item_id,
        l.status::text AS status,
        COALESCE(SUM(
          CASE
            WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
            WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
            ELSE 0
          END
        ), 0)::numeric AS on_hand
      FROM app.inventory_lot_serial l
      LEFT JOIN app.inventory_txn t ON t.lot_serial_id = l.id
      WHERE l.item_id IN (SELECT component_item_id FROM template_components)
      GROUP BY l.id, l.item_id, l.status
    ),
    inventory_per_item AS (
      SELECT
        item_id,
        SUM(CASE WHEN status = 'AVAILABLE' THEN on_hand ELSE 0 END)::numeric AS stock_available,
        SUM(CASE WHEN status = 'HOLD' THEN on_hand ELSE 0 END)::numeric AS stock_hold,
        SUM(CASE WHEN status IN ('AVAILABLE','HOLD') THEN on_hand ELSE 0 END)::numeric AS stock_total
      FROM lot_on_hand
      GROUP BY item_id
    ),
    reservation_per_item AS (
      SELECT
        l.item_id,
        SUM(r.reserved_qty)::numeric AS reserved
      FROM app.reservation r
      JOIN app.inventory_lot_serial l ON l.id = r.lot_serial_id
      WHERE r.status = 'ACTIVE'
        AND l.item_id IN (SELECT component_item_id FROM template_components)
      GROUP BY l.item_id
    ),
    snapshot_agg AS (
      SELECT
        bsl.component_item_id,
        SUM(bsl.gross_required_qty)::numeric AS req_qty,
        SUM(bsl.received_qty + bsl.qc_pass_qty)::numeric AS recv_qty,
        SUM(bsl.open_purchase_qty + bsl.received_qty + bsl.qc_pass_qty)::numeric AS purchased_qty,
        SUM(bsl.qc_pass_qty + bsl.reserved_qty)::numeric AS available_qty_snap,
        SUM(bsl.issued_qty + bsl.assembled_qty)::numeric AS issued_qty,
        BOOL_AND(bsl.state IN ('ISSUED','ASSEMBLED','CLOSED')) AS all_issued,
        BOOL_AND(bsl.state IN ('AVAILABLE','RESERVED','ISSUED','ASSEMBLED','CLOSED')) AS all_available,
        BOOL_OR(bsl.received_qty::numeric > 0 OR bsl.qc_pass_qty::numeric > 0) AS any_received,
        BOOL_OR(bsl.state IN ('PURCHASING','INBOUND_QC') OR bsl.open_purchase_qty::numeric > 0) AS any_purchasing,
        BOOL_OR(bsl.state IN ('ISSUED','ASSEMBLED','CLOSED') OR bsl.issued_qty::numeric > 0) AS any_issued,
        COUNT(DISTINCT bsl.order_id) AS order_count
      FROM app.bom_snapshot_line bsl
      JOIN app.bom_revision br ON br.id = bsl.revision_id
      WHERE br.template_id = ${templateId}
      GROUP BY bsl.component_item_id
    )
    SELECT
      tc.component_item_id::text,
      tc.component_sku,
      tc.component_name,
      COALESCE(NULLIF(s.req_qty, 0), tc.req_per_unit, 0)::text AS total_required,
      COALESCE(s.recv_qty, 0)::text AS total_received,
      COALESCE(s.purchased_qty, 0)::text AS total_purchased,
      COALESCE(s.available_qty_snap, 0)::text AS total_available_snap,
      COALESCE(s.issued_qty, 0)::text AS total_issued,
      COALESCE(s.all_issued, false) AS all_issued,
      COALESCE(s.all_available, false) AS all_available,
      COALESCE(s.any_received, false) AS any_received,
      COALESCE(s.any_purchasing, false) AS any_purchasing,
      COALESCE(s.any_issued, false) AS any_issued,
      COALESCE(s.order_count, 0)::int AS order_count,
      COALESCE(inv.stock_available, 0)::text AS stock_available,
      COALESCE(inv.stock_hold, 0)::text AS stock_hold,
      COALESCE(inv.stock_total, 0)::text AS stock_total,
      COALESCE(res.reserved, 0)::text AS stock_reserved
    FROM template_components tc
    LEFT JOIN snapshot_agg s ON s.component_item_id = tc.component_item_id
    LEFT JOIN inventory_per_item inv ON inv.item_id = tc.component_item_id
    LEFT JOIN reservation_per_item res ON res.item_id = tc.component_item_id
  `)) as unknown as RawRow[];

  if (rows.length === 0) {
    return {
      templateId,
      componentStatuses: [],
      overallStatus: "NO_ORDERS",
      totalComponents: 0,
      availableComponents: 0,
    };
  }

  const componentStatuses: ComponentMaterialStatus[] = rows.map((r) => {
    const required = Number(r.total_required) || 0;
    const purchased = Number(r.total_purchased) || 0;
    const received = Number(r.total_received) || 0;
    const availableSnap = Number(r.total_available_snap) || 0;
    const issued = Number(r.total_issued) || 0;
    const stockAvailRaw = Number(r.stock_available) || 0;
    const stockReserved = Number(r.stock_reserved) || 0;
    const stockNet = Math.max(0, stockAvailRaw - stockReserved);

    // Tổng "available" mở rộng = snapshot reserved + stock thực còn dùng
    // (tránh double-count giữa stock thực vs snapshot reserved/qc_pass).
    const availableMerged = Math.max(availableSnap, stockNet);

    let status: MaterialStatus = "PLANNED";
    if (r.all_issued) {
      status = "ISSUED";
    } else if (required > 0 && stockNet >= required * 0.999) {
      // Stock đủ requirement → AVAILABLE bất kể order
      status = "AVAILABLE";
    } else if (r.all_available) {
      status = "AVAILABLE";
    } else if (r.any_received || stockNet > 0) {
      status = "PARTIAL";
    } else if (r.any_purchasing) {
      status = "PURCHASING";
    }

    const milestones = {
      planned: required > 0 || stockAvailRaw > 0,
      purchasing: r.any_purchasing === true || purchased > 0,
      purchased: received > 0 && required > 0 && received >= required * 0.999,
      available:
        r.all_available === true ||
        (required > 0 && availableMerged >= required * 0.999) ||
        (required === 0 && stockNet > 0),
      issued: r.any_issued === true || (required > 0 && issued >= required * 0.999),
    };

    let pct = 0;
    if (required > 0) {
      // V3.7.60 — Đủ hàng (AVAILABLE) hoặc Đã xuất (ISSUED) đều = 100%.
      // ISSUED hiển thị label/màu khác để phân biệt, không cần gradient pct.
      if (milestones.issued || milestones.available) {
        pct = 100;
      } else if (milestones.purchased) {
        // 60-100: đã nhận đủ, đang chờ chuyển sang available
        const availRatio = Math.min(1, availableMerged / required);
        pct = 60 + availRatio * 40;
      } else if (received > 0 || stockNet > 0) {
        // 30-60: stockNet/received chưa đủ
        const recvRatio = Math.min(1, (received + stockNet) / required);
        pct = 30 + recvRatio * 30;
      } else if (milestones.purchasing) {
        const buyRatio = Math.min(1, purchased / required);
        pct = 10 + buyRatio * 20;
      } else {
        pct = 0;
      }
    } else if (stockAvailRaw > 0) {
      // Không có required (chưa có order), nhưng có stock → 100% sẵn hàng.
      pct = 100;
      status = "AVAILABLE";
      milestones.available = true;
    }
    pct = Math.max(0, Math.min(100, Math.round(pct)));

    const totalShort = Math.max(0, required - availableMerged - issued).toString();

    return {
      componentItemId: r.component_item_id,
      componentSku: r.component_sku,
      componentName: r.component_name,
      totalRequired: r.total_required,
      totalReceived: r.total_received,
      totalShort,
      totalPurchased: r.total_purchased,
      totalAvailable: availableMerged.toString(),
      totalIssued: r.total_issued,
      stockAvailable: stockNet.toString(),
      stockTotal: r.stock_total,
      status,
      orderCount: Number(r.order_count) || 0,
      pct,
      milestones,
    };
  });

  const availableComponents = componentStatuses.filter(
    (c) => c.status === "AVAILABLE" || c.status === "ISSUED",
  ).length;

  let overallStatus: MaterialStatus = "PLANNED";
  const allAvail =
    componentStatuses.length > 0 &&
    availableComponents === componentStatuses.length;
  const anyIssued = componentStatuses.some((c) => c.status === "ISSUED");
  const anyPartial = componentStatuses.some((c) => c.status === "PARTIAL");
  const anyPurchasing = componentStatuses.some((c) => c.status === "PURCHASING");

  if (anyIssued && allAvail) overallStatus = "ISSUED";
  else if (allAvail) overallStatus = "AVAILABLE";
  else if (anyPartial) overallStatus = "PARTIAL";
  else if (anyPurchasing) overallStatus = "PURCHASING";

  return {
    templateId,
    componentStatuses,
    overallStatus,
    totalComponents: componentStatuses.length,
    availableComponents,
  };
}

/**
 * Cập nhật bom_line.derived_status sau khi có event (nhận hàng, WO hoàn thành...).
 * Graceful-degrades nếu cột chưa tồn tại (migration 0008b chưa apply).
 */
export async function syncDerivedStatusToLines(
  templateId: string,
): Promise<void> {
  try {
    const status = await computeTemplateDerivedStatus(templateId);
    if (status.componentStatuses.length === 0) return;

    for (const comp of status.componentStatuses) {
      await db.execute(sql`
        UPDATE app.bom_line
        SET
          derived_status = ${comp.status},
          derived_status_updated_at = NOW()
        WHERE template_id = ${templateId}
          AND component_item_id = ${comp.componentItemId}
      `);
    }
  } catch (err: unknown) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === "42703" || pgCode === "42601") {
      return;
    }
    throw err;
  }
}
