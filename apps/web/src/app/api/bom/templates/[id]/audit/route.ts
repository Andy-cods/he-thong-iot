import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  auditEvent,
  bomSnapshotLine,
  bomTemplate,
  salesOrder,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface BomAuditLogRow {
  id: string;
  action: string;
  objectType: string;
  objectId: string | null;
  actorUsername: string | null;
  notes: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  occurredAt: string;
}

/**
 * V2.0 P2 W6 — TASK-20260427-013.
 *
 * GET /api/bom/templates/[id]/audit
 *
 * Trả audit log cho BOM workspace, gộp:
 *   - object_type='bom_template' AND object_id = :id
 *   - object_type='bom_snapshot_line' AND object_id IN (snapshot lines của orders dùng BOM)
 *   - object_type='sales_order' AND object_id IN (orders dùng BOM)
 *
 * Limit 100 record gần nhất.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "audit");
  if ("response" in guard) return guard.response;

  const id = params.id;
  if (!/^[0-9a-f-]{8,}$/i.test(id)) {
    return jsonError("VALIDATION", "bomTemplateId không hợp lệ", 400);
  }

  const [tpl] = await db
    .select({ id: bomTemplate.id })
    .from(bomTemplate)
    .where(eq(bomTemplate.id, id))
    .limit(1);
  if (!tpl) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  try {
    // Lấy danh sách orderIds + snapshot lineIds liên quan BOM này
    const orderRows = await db
      .select({ id: salesOrder.id })
      .from(salesOrder)
      .where(eq(salesOrder.bomTemplateId, id));
    const orderIds = orderRows.map((r) => r.id);

    let lineIds: string[] = [];
    if (orderIds.length > 0) {
      const lineRows = await db
        .select({ id: bomSnapshotLine.id })
        .from(bomSnapshotLine)
        .where(inArray(bomSnapshotLine.orderId, orderIds));
      lineIds = lineRows.map((r) => r.id);
    }

    // Build OR expr — BOM template + sales orders + snapshot lines
    const orFilters = [
      and(
        eq(auditEvent.objectType, "bom_template"),
        eq(auditEvent.objectId, id),
      ),
    ];
    if (orderIds.length > 0) {
      orFilters.push(
        and(
          eq(auditEvent.objectType, "sales_order"),
          inArray(auditEvent.objectId, orderIds),
        ),
      );
    }
    if (lineIds.length > 0) {
      orFilters.push(
        and(
          eq(auditEvent.objectType, "bom_snapshot_line"),
          inArray(auditEvent.objectId, lineIds),
        ),
      );
    }

    const whereExpr = orFilters.length > 1 ? or(...orFilters) : orFilters[0];

    const rows = await db
      .select({
        id: auditEvent.id,
        action: auditEvent.action,
        objectType: auditEvent.objectType,
        objectId: auditEvent.objectId,
        actorUsername: auditEvent.actorUsername,
        notes: auditEvent.notes,
        beforeJson: auditEvent.beforeJson,
        afterJson: auditEvent.afterJson,
        occurredAt: auditEvent.occurredAt,
      })
      .from(auditEvent)
      .where(whereExpr ?? sql`true`)
      .orderBy(desc(auditEvent.occurredAt))
      .limit(100);

    const data: BomAuditLogRow[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      objectType: r.objectType,
      objectId: r.objectId,
      actorUsername: r.actorUsername,
      notes: r.notes,
      beforeJson: r.beforeJson,
      afterJson: r.afterJson,
      occurredAt:
        r.occurredAt instanceof Date
          ? r.occurredAt.toISOString()
          : String(r.occurredAt),
    }));

    return NextResponse.json({ data });
  } catch (err) {
    logger.error({ err, bomTemplateId: id }, "bom audit log failed");
    return jsonError("INTERNAL", "Không tải được lịch sử BOM.", 500);
  }
}
