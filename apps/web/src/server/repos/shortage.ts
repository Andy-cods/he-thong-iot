import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Repository shortage — V1.2.
 *
 * Nguồn dữ liệu:
 *  - Materialized view `app.shortage_aggregate` (migration 0005e), refresh
 *    manual qua `refreshAggregate()`. V1.3 cron scheduler hourly.
 *  - On-fly query via snapshot_line cho getShortageByOrder (1 order).
 */

export interface ShortageByItemRow {
  componentItemId: string;
  componentSku: string;
  componentName: string;
  totalRequired: number;
  totalAvailable: number;
  totalOnOrder: number;
  totalShort: number;
  orderCount: number;
  lastUpdate: Date;
}

/**
 * Lấy aggregate shortage theo item (qua materialized view).
 */
export async function getShortageByItem(
  limit = 200,
): Promise<ShortageByItemRow[]> {
  const rows = await db.execute(sql`
    SELECT
      component_item_id,
      component_sku,
      component_name,
      total_required,
      total_available,
      total_on_order,
      total_short,
      order_count,
      last_update
    FROM app.shortage_aggregate
    ORDER BY total_short DESC
    LIMIT ${limit}
  `);
  const list = rows as unknown as Array<{
    component_item_id: string;
    component_sku: string;
    component_name: string;
    total_required: string;
    total_available: string;
    total_on_order: string;
    total_short: string;
    order_count: number;
    last_update: Date;
  }>;

  return list.map((r) => ({
    componentItemId: r.component_item_id,
    componentSku: r.component_sku,
    componentName: r.component_name,
    totalRequired: Number.parseFloat(r.total_required),
    totalAvailable: Number.parseFloat(r.total_available),
    totalOnOrder: Number.parseFloat(r.total_on_order),
    totalShort: Number.parseFloat(r.total_short),
    orderCount: r.order_count,
    lastUpdate: r.last_update,
  }));
}

/**
 * V1.6 — Shortage aggregate theo 1 BOM template (on-fly, bypass MV).
 * JOIN bom_snapshot_line → sales_order filter theo bom_template_id,
 * SUM short qty + AVG available. Data scope nhỏ (1 BOM) nên perf OK
 * không cần MV riêng.
 */
export async function getShortageByBomTemplate(
  bomTemplateId: string,
  limit = 200,
): Promise<ShortageByItemRow[]> {
  const rows = await db.execute(sql`
    SELECT
      bsl.component_item_id,
      bsl.component_sku,
      bsl.component_name,
      SUM(bsl.gross_required_qty)::text AS total_required,
      SUM(bsl.qc_pass_qty)::text AS total_available,
      SUM(bsl.open_purchase_qty)::text AS total_on_order,
      SUM(bsl.remaining_short_qty)::text AS total_short,
      COUNT(DISTINCT bsl.order_id)::int AS order_count,
      MAX(bsl.updated_at) AS last_update
    FROM app.bom_snapshot_line bsl
    JOIN app.sales_order so ON so.id = bsl.order_id
    WHERE so.bom_template_id = ${bomTemplateId}
      AND bsl.remaining_short_qty > 0
    GROUP BY bsl.component_item_id, bsl.component_sku, bsl.component_name
    ORDER BY SUM(bsl.remaining_short_qty) DESC
    LIMIT ${limit}
  `);
  const list = rows as unknown as Array<{
    component_item_id: string;
    component_sku: string;
    component_name: string;
    total_required: string;
    total_available: string;
    total_on_order: string;
    total_short: string;
    order_count: number;
    last_update: Date;
  }>;
  return list.map((r) => ({
    componentItemId: r.component_item_id,
    componentSku: r.component_sku,
    componentName: r.component_name,
    totalRequired: Number.parseFloat(r.total_required),
    totalAvailable: Number.parseFloat(r.total_available),
    totalOnOrder: Number.parseFloat(r.total_on_order),
    totalShort: Number.parseFloat(r.total_short),
    orderCount: r.order_count,
    lastUpdate: r.last_update,
  }));
}

/**
 * Lấy shortage của 1 order cụ thể (on-fly, không qua MV).
 * Hiển thị breakdown component với remaining_short_qty > 0.
 */
export async function getShortageByOrder(orderId: string) {
  const rows = await db.execute(sql`
    SELECT
      bsl.id AS snapshot_line_id,
      bsl.component_item_id,
      bsl.component_sku,
      bsl.component_name,
      bsl.level,
      bsl.gross_required_qty,
      bsl.open_purchase_qty,
      bsl.received_qty,
      bsl.qc_pass_qty,
      bsl.reserved_qty,
      bsl.remaining_short_qty,
      bsl.state
    FROM app.bom_snapshot_line bsl
    WHERE bsl.order_id = ${orderId}
      AND bsl.remaining_short_qty > 0
    ORDER BY bsl.remaining_short_qty DESC
  `);
  return rows as unknown as Array<Record<string, unknown>>;
}

/**
 * Refresh materialized view `app.shortage_aggregate` (CONCURRENTLY).
 * Dùng sau mutation lớn (receiving, QC, PR convert). Chậm nhẹ — V1.3 cron hourly.
 */
export async function refreshAggregate(): Promise<void> {
  await db.execute(sql`SELECT app.refresh_shortage_aggregate()`);
}
