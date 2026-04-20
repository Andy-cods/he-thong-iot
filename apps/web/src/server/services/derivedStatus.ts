import { eq, sql } from "drizzle-orm";
import { bomRevision, bomSnapshotLine } from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * Trụ cột 5 — Cross-module status sync.
 *
 * Tính derived material status từ bom_snapshot_line (không cần migration 0008b).
 * Query aggregates per-component across ALL orders that use this template.
 *
 * Khi migration 0008b được apply, bổ sung write-back vào bom_line.derived_status.
 */

export type MaterialStatus =
  | "NO_ORDERS"     // Không có đơn hàng nào dùng BOM này
  | "PLANNED"       // Chưa có PO nào
  | "PURCHASING"    // Đang mua
  | "PARTIAL"       // Nhận một phần
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
}

export interface TemplateDerivedStatus {
  templateId: string;
  componentStatuses: ComponentMaterialStatus[];
  overallStatus: MaterialStatus;
  totalComponents: number;
  availableComponents: number;
}

export async function computeTemplateDerivedStatus(
  templateId: string,
): Promise<TemplateDerivedStatus> {
  // Aggregate bom_snapshot_line per component across all orders using this template
  const rows = await db
    .select({
      componentItemId: bomSnapshotLine.componentItemId,
      componentSku: bomSnapshotLine.componentSku,
      componentName: bomSnapshotLine.componentName,
      totalRequired: sql<string>`COALESCE(SUM(${bomSnapshotLine.grossRequiredQty}), '0')::text`,
      totalReceived: sql<string>`COALESCE(SUM(${bomSnapshotLine.receivedQty} + ${bomSnapshotLine.qcPassQty}), '0')::text`,
      totalShort: sql<string>`COALESCE(SUM(GREATEST(0, ${bomSnapshotLine.grossRequiredQty} - ${bomSnapshotLine.qcPassQty} - ${bomSnapshotLine.reservedQty} - ${bomSnapshotLine.issuedQty})), '0')::text`,
      orderCount: sql<number>`COUNT(DISTINCT ${bomSnapshotLine.orderId})::int`,
      allIssued: sql<boolean>`BOOL_AND(${bomSnapshotLine.state} IN ('ISSUED','ASSEMBLED','CLOSED'))`,
      allAvailable: sql<boolean>`BOOL_AND(${bomSnapshotLine.state} IN ('AVAILABLE','RESERVED','ISSUED','ASSEMBLED','CLOSED'))`,
      anyReceived: sql<boolean>`BOOL_OR(${bomSnapshotLine.receivedQty}::numeric > 0 OR ${bomSnapshotLine.qcPassQty}::numeric > 0)`,
      anyPurchasing: sql<boolean>`BOOL_OR(${bomSnapshotLine.state} IN ('PURCHASING','INBOUND_QC'))`,
    })
    .from(bomSnapshotLine)
    .innerJoin(bomRevision, eq(bomRevision.id, bomSnapshotLine.revisionId))
    .where(eq(bomRevision.templateId, templateId))
    .groupBy(
      bomSnapshotLine.componentItemId,
      bomSnapshotLine.componentSku,
      bomSnapshotLine.componentName,
    );

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
    let status: MaterialStatus = "PLANNED";
    if (r.allIssued) status = "ISSUED";
    else if (r.allAvailable) status = "AVAILABLE";
    else if (r.anyReceived) status = "PARTIAL";
    else if (r.anyPurchasing) status = "PURCHASING";

    return {
      componentItemId: r.componentItemId,
      componentSku: r.componentSku,
      componentName: r.componentName,
      totalRequired: r.totalRequired,
      totalReceived: r.totalReceived,
      totalShort: r.totalShort,
      status,
      orderCount: r.orderCount,
    };
  });

  const availableComponents = componentStatuses.filter(
    (c) => c.status === "AVAILABLE" || c.status === "ISSUED",
  ).length;

  let overallStatus: MaterialStatus = "PLANNED";
  const allAvail = availableComponents === componentStatuses.length;
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

    // Update bom_line.derived_status per component_item_id
    // Using raw SQL because column may not exist yet (0008b migration pending)
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
    // Gracefully skip if columns don't exist yet (migration 0008b pending)
    const pgCode = (err as { code?: string }).code;
    if (pgCode === "42703" || pgCode === "42601") {
      // column does not exist — expected before migration 0008b
      return;
    }
    throw err;
  }
}
